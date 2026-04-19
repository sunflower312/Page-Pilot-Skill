import { captureActionStabilityBaseline, waitForActionStability } from './action-stability.js';
import { browserReadAssertionText } from './assertion-text.js';
import { isPointerInterceptionError, recoverCheckboxToggle, resolveActionLocator } from './locator-runtime.js';

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

  for (const [stepIndex, action] of actions.entries()) {
    try {
      if (action.type === 'navigate') {
        const before = await captureStabilityBaseline(page, action.stability);
        await page.goto(action.url, { waitUntil: action.waitUntil });
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(buildStep(action.type, { url: action.url, waitUntil: action.waitUntil, stability }));
        continue;
      }

      if (action.type === 'fill') {
        const resolution = await resolveForAction(page, action);
        const before = await captureStabilityBaseline(page, action.stability);
        await resolution.locator.fill(action.value);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            value: action.value,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
          })
        );
        continue;
      }

      if (action.type === 'click') {
        const resolution = await resolveForAction(page, action);
        const before = await captureStabilityBaseline(page, action.stability);
        await resolution.locator.click();
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(buildStep(action.type, { locator: resolution.selected, verification: resolution.verification, stability }));
        continue;
      }

      if (action.type === 'press') {
        const resolution = await resolveForAction(page, action);
        const before = await captureStabilityBaseline(page, action.stability);
        await resolution.locator.press(action.value);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            key: action.value,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
          })
        );
        continue;
      }

      if (action.type === 'select') {
        const resolution = await resolveForAction(page, action);
        const before = await captureStabilityBaseline(page, action.stability);
        await resolution.locator.selectOption(action.value);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            value: action.value,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
          })
        );
        continue;
      }

      if (action.type === 'check') {
        const resolution = await resolveForAction(page, action);
        const before = await captureStabilityBaseline(page, action.stability);
        await runCheckboxAction(resolution.locator, action.checked !== false);
        const stability = await waitForActionStability(page, action.stability, { before });
        steps.push(
          buildStep(action.type, {
            checked: action.checked !== false,
            locator: resolution.selected,
            verification: resolution.verification,
            stability,
          })
        );
        continue;
      }

      if (action.type === 'capture') {
        const resolution = action.locator ? await resolveForAction(page, action) : null;
        const path = await runCapture(page, action, options, resolution);
        steps.push(
          buildStep(action.type, {
            path,
            locator: resolution?.selected,
            verification: resolution?.verification,
          })
        );
        continue;
      }

      if (action.type === 'wait_for') {
        await page.waitForTimeout(action.value);
        steps.push(buildStep(action.type, { value: action.value }));
        continue;
      }

      if (action.type === 'assert_text') {
        const resolution = await resolveForAction(page, action);
        const textResult = await readLocatorText(resolution.locator);
        if (!String(textResult?.text ?? '').includes(action.value)) {
          throw new Error(`Expected text to include "${action.value}", got "${textResult?.text}"`);
        }
        steps.push(
          buildStep(action.type, {
            text: textResult.text,
            value: action.value,
            assertionSource: textResult.source,
            locator: resolution.selected,
            verification: resolution.verification,
          })
        );
        continue;
      }

      if (action.type === 'assert_url') {
        const currentUrl = page.url?.() ?? '';
        if (!currentUrl.includes(action.value)) {
          throw new Error(`Expected URL to include "${action.value}", got "${currentUrl}"`);
        }
        steps.push(buildStep(action.type, { url: currentUrl, value: action.value }));
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
