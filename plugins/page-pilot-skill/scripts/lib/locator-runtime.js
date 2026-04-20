function safeErrorMessage(error) {
  return error?.message ?? String(error ?? 'Unknown error');
}

function normalizeLocatorReference(locator = {}) {
  return locator?.locator?.strategy ? locator.locator : locator;
}

function browserRecoverCheckboxToggle(element, desiredChecked) {
  if (!element || typeof element.checked !== 'boolean') {
    return {
      attempted: false,
      source: null,
      checked: Boolean(element?.checked),
    };
  }

  const seen = new Set();
  const candidates = [];
  const pushCandidate = (node, source) => {
    if (!node || typeof node.click !== 'function' || seen.has(node)) {
      return;
    }
    seen.add(node);
    candidates.push({ node, source });
  };

  for (const label of Array.from(element.labels ?? [])) {
    pushCandidate(label, 'label');
  }

  pushCandidate(element.closest?.('label'), 'closest_label');
  pushCandidate(element.closest?.('[role="checkbox"]'), 'role_checkbox');

  if (Boolean(element.checked) === desiredChecked) {
    return {
      attempted: false,
      source: 'already_toggled',
      checked: Boolean(element.checked),
    };
  }

  for (const candidate of candidates) {
    candidate.node.click();
    if (Boolean(element.checked) === desiredChecked) {
      return {
        attempted: true,
        source: candidate.source,
        checked: Boolean(element.checked),
      };
    }
  }

  return {
    attempted: candidates.length > 0,
    source: candidates[0]?.source ?? null,
    checked: Boolean(element.checked),
  };
}

async function readCheckedState(locator) {
  if (typeof locator?.isChecked === 'function') {
    return locator.isChecked();
  }

  return Boolean(await locator.evaluate((element) => Boolean(element?.checked)));
}

export function isPointerInterceptionError(error) {
  return /intercepts pointer events|element click intercepted|another element would receive the click/i.test(
    safeErrorMessage(error)
  );
}

export async function recoverCheckboxToggle(locator, desiredChecked) {
  const beforeChecked = await readCheckedState(locator);
  if (beforeChecked === desiredChecked) {
    return {
      ok: true,
      attempted: false,
      beforeChecked,
      afterChecked: beforeChecked,
      source: 'already_toggled',
    };
  }

  const recovery = await locator.evaluate(browserRecoverCheckboxToggle, desiredChecked);
  const afterChecked = await readCheckedState(locator);

  return {
    ok: afterChecked === desiredChecked,
    attempted: Boolean(recovery?.attempted),
    beforeChecked,
    afterChecked,
    source: recovery?.source ?? null,
  };
}

export function resolveLocator(page, locator = {}) {
  const locatorRef = normalizeLocatorReference(locator);

  if (locatorRef.strategy === 'label') {
    return page.getByLabel(locatorRef.value);
  }

  if (locatorRef.strategy === 'role') {
    return page.getByRole(locatorRef.value.role, {
      name: locatorRef.value.name,
      exact: locatorRef.value.exact !== false,
    });
  }

  if (locatorRef.strategy === 'text') {
    return page.getByText(locatorRef.value, { exact: true });
  }

  if (locatorRef.strategy === 'placeholder') {
    return page.getByPlaceholder(locatorRef.value);
  }

  if (locatorRef.strategy === 'testId') {
    return page.getByTestId(locatorRef.value);
  }

  if (locatorRef.strategy === 'css') {
    return page.locator(locatorRef.value);
  }

  throw new Error(`Unsupported locator strategy: ${locatorRef.strategy}`);
}

function getRequirements(usage) {
  return {
    needsVisible: ['click', 'fill', 'press', 'select', 'check', 'capture'].includes(usage),
    needsEnabled: ['click', 'press', 'select', 'check'].includes(usage),
    needsEditable: ['fill'].includes(usage),
  };
}

async function maybeCall(target, method, args = [], fallback = undefined) {
  if (typeof target?.[method] !== 'function') {
    return fallback;
  }

  try {
    return await target[method](...args);
  } catch (error) {
    return { $error: safeErrorMessage(error) };
  }
}

function normalizeOutcome(value, fallback) {
  return value && typeof value === 'object' && '$error' in value ? fallback : value;
}

function extractProbeError(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && '$error' in value) {
      return value.$error;
    }
  }
  return null;
}

export async function verifyLocatorCandidate(page, locatorRef, usage, options = {}) {
  const normalizedLocatorRef = normalizeLocatorReference(locatorRef);
  const locator = resolveLocator(page, normalizedLocatorRef);
  const target = typeof locator.first === 'function' ? locator.first() : locator;
  const requirements = getRequirements(usage);
  const timeoutMs = options.timeoutMs ?? 1200;
  const rawCount = await maybeCall(locator, 'count', [], 1);
  if (rawCount && typeof rawCount === 'object' && '$error' in rawCount) {
    return {
      locator,
      target,
      inspection: {
        locator: normalizedLocatorRef,
        count: null,
        unique: false,
        actionable: false,
        usable: false,
        ok: false,
        failureCode: 'LOCATOR_NOT_ACTIONABLE',
        message: rawCount.$error,
      },
    };
  }
  const count = typeof rawCount === 'number' ? rawCount : 1;

  if (count === 0) {
    if (
      normalizedLocatorRef.strategy === 'role' &&
      normalizedLocatorRef.value?.exact === true &&
      options.allowRoleExactFallback !== false
    ) {
      return verifyLocatorCandidate(
        page,
        {
          ...normalizedLocatorRef,
          value: {
            ...normalizedLocatorRef.value,
            exact: false,
          },
        },
        usage,
        {
          ...options,
          allowRoleExactFallback: false,
        }
      );
    }

    return {
      locator,
      target,
      inspection: {
        locator: normalizedLocatorRef,
        count,
        unique: false,
        actionable: false,
        usable: false,
        ok: false,
        failureCode: 'LOCATOR_NO_MATCH',
        message: 'Locator did not match any elements',
      },
    };
  }

  if (count > 1) {
    return {
      locator,
      target,
      inspection: {
        locator: normalizedLocatorRef,
        count,
        unique: false,
        actionable: false,
        usable: false,
        ok: false,
        failureCode: 'LOCATOR_NOT_UNIQUE',
        message: `Locator matched ${count} elements`,
      },
    };
  }

  const rawVisible = await maybeCall(target, 'isVisible', [{ timeout: timeoutMs }], true);
  const rawEnabled = await maybeCall(target, 'isEnabled', [{ timeout: timeoutMs }], true);
  const rawEditable = await maybeCall(target, 'isEditable', [{ timeout: timeoutMs }], true);
  const probeError = extractProbeError(
    requirements.needsVisible ? rawVisible : null,
    requirements.needsEnabled ? rawEnabled : null,
    requirements.needsEditable ? rawEditable : null
  );
  const visible = normalizeOutcome(rawVisible, false);
  const enabled = normalizeOutcome(rawEnabled, false);
  const editable = normalizeOutcome(rawEditable, false);
  const actionable =
    !probeError &&
    (!requirements.needsVisible || visible !== false) &&
    (!requirements.needsEnabled || enabled !== false) &&
    (!requirements.needsEditable || editable !== false);

  return {
    locator,
    target,
    inspection: {
      locator: normalizedLocatorRef,
      count,
      unique: true,
      visible,
      enabled,
      editable,
      actionable,
      usable: actionable,
      ok: actionable,
      failureCode: actionable ? undefined : 'LOCATOR_NOT_ACTIONABLE',
      message: actionable ? undefined : probeError ?? 'Locator matched an element that is not actionable',
    },
  };
}

export async function resolveActionLocator(page, action = {}, usage, options = {}) {
  const candidates = [action.locator, ...(action.fallbackLocators ?? [])].filter(Boolean);
  const inspections = [];

  for (const locatorRef of candidates) {
    const result = await verifyLocatorCandidate(page, locatorRef, usage, options);
    inspections.push(result.inspection);
    if (result.inspection.ok) {
      return {
        selected: result.inspection.locator ?? normalizeLocatorReference(locatorRef),
        locator: result.target,
        candidates: inspections,
      };
    }
  }

  return {
    selected: null,
    locator: null,
    candidates: inspections,
  };
}
