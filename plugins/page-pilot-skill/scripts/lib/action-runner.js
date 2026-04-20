import { captureActionStabilityBaseline, waitForActionStability } from './action-stability.js';
import { browserReadAssertionText } from './assertion-text.js';
import { deriveSemanticTargetFromLocator, rankSemanticTarget } from './semantic-target-ranking.js';
import { isPointerInterceptionError, recoverCheckboxToggle, resolveActionLocator, verifyLocatorCandidate } from './locator-runtime.js';
import { createRuntimeParameterResolver, parseOptionToken } from './runtime-parameters.js';
import { collectStructuredPageData } from './structured-scan.js';

function createFailure(stepIndex, action, error, page, steps) {
  return {
    ok: false,
    error: {
      code: 'ACTION_STEP_FAILED',
      message: error?.message ?? 'Unknown action error',
      stepIndex,
      action,
      details: error?.details,
    },
    steps: [
      ...steps,
      {
        type: action?.type ?? 'unknown',
        ok: false,
        error: error?.message ?? 'Unknown action error',
      },
    ],
    finalUrl: page.url?.() ?? null,
    finalTitle: null,
  };
}

async function runCapture(page, action, options, resolution = null) {
  const locator = resolution?.locator ?? null;

  if (typeof options.capture === 'function') {
    return options.capture(action, page, locator);
  }

  if (!locator) {
    return null;
  }

  if (typeof locator.screenshot !== 'function') {
    return null;
  }

  await locator.screenshot({});
  return null;
}

async function readLocatorText(locator) {
  return locator.evaluate(browserReadAssertionText);
}

function buildStep(type, extra = {}) {
  return { type, ok: true, ...extra };
}

async function captureLocatorCodegenEvidence(page, locator) {
  if (!locator) {
    return {
      locatorRanking: [],
      semanticTarget: null,
      stableFingerprint: null,
      confidence: null,
    };
  }

  const scan = await collectStructuredPageData(page, { detailLevel: 'standard' }).catch(() => null);
  if (!scan) {
    return {
      locatorRanking: [],
      semanticTarget: null,
      stableFingerprint: null,
      confidence: null,
    };
  }

  const ranking = rankSemanticTarget(scan, deriveSemanticTargetFromLocator(locator), { limit: 5 });
  return {
    locatorRanking: ranking.matches ?? [],
    semanticTarget: ranking.matches?.[0]?.element ?? null,
    stableFingerprint: ranking.matches?.[0]?.stableFingerprint ?? null,
    confidence: ranking.matches?.[0]?.confidence ?? null,
  };
}

function extractSelectedVerification(verification = {}, selected = null) {
  const candidates = verification?.candidates ?? [];
  const selectedKey = JSON.stringify(selected);
  return candidates.find((candidate) => JSON.stringify(candidate.locator) === selectedKey) ?? null;
}

async function selectCodegenVerification(page, usage, locatorRanking = [], selected = null, verification = null) {
  const existingCandidates = verification?.candidates ?? [];
  const rankedCandidates = locatorRanking.flatMap((match) => [
    match.preferredLocator,
    ...(match.recommendedLocators?.map((entry) => entry.locator) ?? []),
    ...(match.fallbackLocators ?? []),
  ]);
  const candidates = [...rankedCandidates, selected].filter(Boolean);
  const deduped = [];
  const seen = new Set();

  for (const locator of candidates) {
    const key = JSON.stringify(locator);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(locator);
  }

  for (const locator of deduped) {
    const existing = existingCandidates.find((candidate) => JSON.stringify(candidate.locator) === JSON.stringify(locator));
    if (existing?.unique === true && existing?.usable === true) {
      return existing;
    }

    const verified = await verifyLocatorCandidate(page, locator, usage).catch(() => null);
    if (verified?.inspection?.unique === true && verified?.inspection?.usable === true) {
      return verified.inspection;
    }
  }

  return extractSelectedVerification(verification, selected);
}

async function captureStabilityBaseline(page, options = {}) {
  if (options.after === 'none') {
    return null;
  }

  return captureActionStabilityBaseline(page);
}

async function runCheckboxAction(locator, desiredChecked) {
  const method = desiredChecked === false && typeof locator.uncheck === 'function' ? 'uncheck' : 'check';

  try {
    await locator[method]();
  } catch (error) {
    if (!isPointerInterceptionError(error)) {
      throw error;
    }

    const recovery = await recoverCheckboxToggle(locator, desiredChecked);
    if (!recovery.ok) {
      throw error;
    }
  }
}

async function resolveSelectValue(locator, value, runtimeParameters) {
  const optionToken = parseOptionToken(value);
  if (!optionToken) {
    return runtimeParameters.resolve(value);
  }

  return locator.evaluate((element, position) => {
    const options = Array.from(element?.options ?? []);
    if (options.length === 0) {
      throw new Error('Select element has no options to choose from');
    }
    const option = position === 'last' ? options[options.length - 1] : options[0];
    return option.value || option.label || option.textContent || '';
  }, optionToken.position);
}

async function resolveForAction(page, action) {
  if (!action.locator) {
    return null;
  }

  const resolution = await resolveActionLocator(page, action, action.type);
  if (resolution.selected) {
    return {
      locator: resolution.locator,
      selected: resolution.selected,
      verification: {
        selected: resolution.selected,
        candidates: resolution.candidates,
      },
    };
  }

  const error = new Error('Unable to resolve a usable locator for this action');
  error.details = { candidates: resolution.candidates };
  throw error;
}

export async function runActions(page, actions = [], options = {}) {
  const steps = [];
  const runtimeParameters = createRuntimeParameterResolver();

  for (const [stepIndex, action] of actions.entries()) {
    try {
      if (action.type === 'navigate') {
        const before = await captureStabilityBaseline(page, action.stability);
        const resolvedUrl = runtimeParameters.resolve(action.url);
        await page.goto(resolvedUrl, { waitUntil: action.waitUntil });
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            url: action.url,
            resolvedUrl,
            waitUntil: action.waitUntil,
            stability,
            expectedStateChange: action.expectedStateChange ?? null,
            currentUrl: page.url?.() ?? null,
          })
        );
        continue;
      }

      if (action.type === 'fill') {
        const resolution = await resolveForAction(page, action);
        const codegenEvidence = await captureLocatorCodegenEvidence(page, resolution.selected);
        const codegenVerification = await selectCodegenVerification(
          page,
          action.type,
          codegenEvidence.locatorRanking,
          resolution.selected,
          resolution.verification
        );
        const before = await captureStabilityBaseline(page, action.stability);
        const resolvedValue = runtimeParameters.resolve(action.value);
        await resolution.locator.fill(resolvedValue);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            value: action.value,
            resolvedValue,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
            expectedStateChange: action.expectedStateChange ?? null,
            currentUrl: page.url?.() ?? null,
            codegenVerification,
            ...codegenEvidence,
          })
        );
        continue;
      }

      if (action.type === 'click') {
        const resolution = await resolveForAction(page, action);
        const codegenEvidence = await captureLocatorCodegenEvidence(page, resolution.selected);
        const codegenVerification = await selectCodegenVerification(
          page,
          action.type,
          codegenEvidence.locatorRanking,
          resolution.selected,
          resolution.verification
        );
        const before = await captureStabilityBaseline(page, action.stability);
        await resolution.locator.click();
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
            expectedStateChange: action.expectedStateChange ?? null,
            currentUrl: page.url?.() ?? null,
            codegenVerification,
            ...codegenEvidence,
          })
        );
        continue;
      }

      if (action.type === 'press') {
        const resolution = await resolveForAction(page, action);
        const codegenEvidence = await captureLocatorCodegenEvidence(page, resolution.selected);
        const codegenVerification = await selectCodegenVerification(
          page,
          action.type,
          codegenEvidence.locatorRanking,
          resolution.selected,
          resolution.verification
        );
        const before = await captureStabilityBaseline(page, action.stability);
        const resolvedValue = runtimeParameters.resolve(action.value);
        await resolution.locator.press(resolvedValue);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            key: action.value,
            resolvedKey: resolvedValue,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
            expectedStateChange: action.expectedStateChange ?? null,
            currentUrl: page.url?.() ?? null,
            codegenVerification,
            ...codegenEvidence,
          })
        );
        continue;
      }

      if (action.type === 'select') {
        const resolution = await resolveForAction(page, action);
        const codegenEvidence = await captureLocatorCodegenEvidence(page, resolution.selected);
        const codegenVerification = await selectCodegenVerification(
          page,
          action.type,
          codegenEvidence.locatorRanking,
          resolution.selected,
          resolution.verification
        );
        const before = await captureStabilityBaseline(page, action.stability);
        const resolvedValue = Array.isArray(action.value)
          ? await Promise.all(action.value.map((entry) => resolveSelectValue(resolution.locator, entry, runtimeParameters)))
          : await resolveSelectValue(resolution.locator, action.value, runtimeParameters);
        await resolution.locator.selectOption(resolvedValue);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            value: action.value,
            resolvedValue,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
            expectedStateChange: action.expectedStateChange ?? null,
            currentUrl: page.url?.() ?? null,
            codegenVerification,
            ...codegenEvidence,
          })
        );
        continue;
      }

      if (action.type === 'check') {
        const resolution = await resolveForAction(page, action);
        const codegenEvidence = await captureLocatorCodegenEvidence(page, resolution.selected);
        const codegenVerification = await selectCodegenVerification(
          page,
          action.type,
          codegenEvidence.locatorRanking,
          resolution.selected,
          resolution.verification
        );
        const before = await captureStabilityBaseline(page, action.stability);
        await runCheckboxAction(resolution.locator, action.checked !== false);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            checked: action.checked !== false,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
            expectedStateChange: action.expectedStateChange ?? null,
            currentUrl: page.url?.() ?? null,
            codegenVerification,
            ...codegenEvidence,
          })
        );
        continue;
      }

      if (action.type === 'capture') {
        const resolution = action.locator ? await resolveForAction(page, action) : null;
        const codegenEvidence = resolution ? await captureLocatorCodegenEvidence(page, resolution.selected) : {};
        const codegenVerification = resolution
          ? await selectCodegenVerification(page, 'capture', codegenEvidence.locatorRanking, resolution.selected, resolution.verification)
          : null;
        const path = await runCapture(page, action, options, resolution);
        steps.push(
          buildStep(action.type, {
            path,
            locator: resolution?.selected,
            verification: resolution?.verification,
            currentUrl: page.url?.() ?? null,
            codegenVerification,
            ...codegenEvidence,
          })
        );
        continue;
      }

      if (action.type === 'wait_for') {
        await page.waitForTimeout(action.value);
        steps.push(buildStep(action.type, { value: action.value, currentUrl: page.url?.() ?? null }));
        continue;
      }

      if (action.type === 'assert_text') {
        const resolution = await resolveForAction(page, action);
        const codegenEvidence = await captureLocatorCodegenEvidence(page, resolution.selected);
        const codegenVerification = await selectCodegenVerification(
          page,
          'capture',
          codegenEvidence.locatorRanking,
          resolution.selected,
          resolution.verification
        );
        const textResult = await readLocatorText(resolution.locator);
        const expectedText = runtimeParameters.resolve(action.value);
        if (!String(textResult?.text ?? '').includes(expectedText)) {
          throw new Error(`Expected text to include "${expectedText}", got "${textResult?.text}"`);
        }
        steps.push(
          buildStep(action.type, {
            text: textResult.text,
            value: action.value,
            resolvedValue: expectedText,
            assertionSource: textResult.source,
            locator: resolution.selected,
            verification: resolution.verification,
            currentUrl: page.url?.() ?? null,
            codegenVerification,
            ...codegenEvidence,
          })
        );
        continue;
      }

      if (action.type === 'assert_url') {
        const currentUrl = page.url?.() ?? '';
        const expectedUrl = runtimeParameters.resolve(action.value);
        if (!currentUrl.includes(expectedUrl)) {
          throw new Error(`Expected URL to include "${expectedUrl}", got "${currentUrl}"`);
        }
        steps.push(buildStep(action.type, { url: currentUrl, value: action.value, resolvedValue: expectedUrl, currentUrl }));
        continue;
      }

      throw new Error(`Unsupported action type: ${action.type}`);
    } catch (error) {
      return createFailure(stepIndex, action, error, page, steps);
    }
  }

  return {
    ok: true,
    steps,
    finalUrl: page.url?.() ?? null,
    finalTitle: (await page.title?.()) ?? null,
  };
}
