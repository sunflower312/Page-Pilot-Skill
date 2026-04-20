import { buildObservation, captureObservationSnapshot } from './observation.js';
import { isTransientExecutionContextError } from './script-execution.js';
import { browserWaitForStability } from './stability-wait.js';

function canObserve(page) {
  return typeof page?.evaluate === 'function' && typeof page?.title === 'function' && typeof page?.context === 'function';
}

function hasSemanticObservationChange(observation) {
  if (!observation) {
    return false;
  }

  if (Array.isArray(observation.reasons) && observation.reasons.length > 0) {
    return true;
  }

  const semanticDiff = observation.semanticDiff ?? {};
  return (
    semanticDiff.dialogChanged === true ||
    semanticDiff.dialogOpened === true ||
    semanticDiff.dialogClosed === true ||
    semanticDiff.primaryActionChanged === true ||
    semanticDiff.mainRegionChanged === true ||
    semanticDiff.feedbackChanged === true ||
    semanticDiff.interactionStateChanged === true
  );
}

function hasStructuralObservationChange(observation) {
  if (!observation) {
    return false;
  }

  if (observation.documentChanged) {
    return true;
  }

  if (Array.isArray(observation.openedPages) && observation.openedPages.length > 0) {
    return true;
  }

  if (hasSemanticObservationChange(observation)) {
    return true;
  }

  if (Array.isArray(observation.newText) && observation.newText.length > 0) {
    return true;
  }

  if (Array.isArray(observation.removedText) && observation.removedText.length > 0) {
    return true;
  }

  return Object.values(observation.domChange ?? {}).some((delta) => delta !== 0);
}

function classifyObservationTrigger(observation) {
  if (!observation) {
    return 'no_change';
  }

  if (observation.urlChanged) {
    return 'url_change';
  }

  if (hasStructuralObservationChange(observation)) {
    return 'dom_change';
  }

  return 'no_change';
}

export async function captureActionStabilityBaseline(page) {
  return canObserve(page) ? captureObservationSnapshot(page) : null;
}

async function waitForObservedStability(page, { settleMs, minObserveMs, timeoutMs, startedAt, stabilityKey }) {
  const polling = Math.min(100, settleMs);
  const stateKey = '__pagePilotStability';

  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);

    try {
      if (typeof page?.waitForLoadState === 'function') {
        await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1, Math.min(remainingMs, 800)) }).catch(() => {});
      }

      if (typeof page?.waitForFunction === 'function') {
        await page.waitForFunction(
          browserWaitForStability,
          { settleMs, minObserveMs, stabilityKey, stateKey },
          { timeout: Math.max(1, remainingMs), polling }
        );
      }

      return true;
    } catch (error) {
      if (!isTransientExecutionContextError(error)) {
        throw error;
      }
    }
  }

  return false;
}

export async function waitForActionStability(page, options = {}, baseline = {}) {
  const startedAt = Date.now();
  const mode = options.after ?? 'auto';
  if (mode === 'none') {
    return {
      applied: false,
      mode,
      status: 'skipped',
      settled: false,
      trigger: 'no_change',
      elapsedMs: 0,
    };
  }

  const timeoutMs = options.timeoutMs ?? 1500;
  const settleMs = options.settleMs ?? 120;
  const minObserveMs = Math.min(timeoutMs, options.minObserveMs ?? Math.max(350, settleMs * 3));
  const stabilityKey = options.stabilityKey ?? `${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const before = baseline.before ?? (await captureActionStabilityBaseline(page));

  try {
    const settled = await waitForObservedStability(page, {
      settleMs,
      minObserveMs,
      timeoutMs,
      startedAt,
      stabilityKey,
    });

    if (!settled) {
      return {
        applied: true,
        mode,
        status: 'timeout',
        settled: false,
        trigger: 'no_change',
        elapsedMs: Date.now() - startedAt,
      };
    }
  } catch {
    return {
      applied: true,
      mode,
      status: 'timeout',
      settled: false,
      trigger: 'no_change',
      elapsedMs: Date.now() - startedAt,
    };
  }

  const after = canObserve(page) ? await captureObservationSnapshot(page) : null;
  const observation = before && after ? buildObservation(before, after) : null;
  const trigger = classifyObservationTrigger(observation);

  return {
    applied: true,
    mode,
    status: 'settled',
    settled: true,
    trigger,
    elapsedMs: Date.now() - startedAt,
    settleMs,
    minObserveMs,
    timeoutMs,
    observation,
  };
}
