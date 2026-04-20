import { collectStructuredPageData } from './structured-scan.js';
import { deriveSemanticTargetFromLocator, rankSemanticTarget } from './semantic-target-ranking.js';
import { verifyLocatorCandidate } from './locator-runtime.js';

function countActionSteps(steps = [], predicate) {
  return steps.filter(predicate).length;
}

function chooseLocator(step = {}, ranking = null) {
  const selected = step.locator ?? null;
  const recommended = ranking?.matches?.[0]?.recommendedLocators ?? [];
  const preferred = ranking?.matches?.[0]?.preferredLocator ?? null;
  const locators = [preferred, ...recommended, selected, ...(ranking?.matches?.[0]?.fallbackLocators ?? [])].filter(Boolean);
  const unique = [];
  const seen = new Set();

  for (const locator of locators) {
    const key = JSON.stringify(locator);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(locator);
  }

  return {
    locatorChoice: unique[0] ?? null,
    fallbackLocatorChoices: unique.slice(1),
  };
}

function normalizeRanking(step = {}, validationScan = null) {
  if (Array.isArray(step.locatorRanking) && step.locatorRanking.length > 0) {
    return {
      matches: step.locatorRanking,
    };
  }

  const locatorTarget = deriveSemanticTargetFromLocator(step.locator);
  const fallbackTarget = deriveSemanticTargetFromLocator(step.verification?.selected);
  const target = {
    ...fallbackTarget,
    ...locatorTarget,
  };

  if (!validationScan || Object.keys(target).length === 0) {
    return null;
  }

  return rankSemanticTarget(validationScan, target, { limit: 5 });
}

function buildAssertionPlan(step = {}) {
  if (step.type === 'assert_text') {
    return {
      kind: 'text_contains',
      expected: step.value,
      source: step.assertionSource ?? 'runtime_text',
    };
  }

  if (step.type === 'assert_url') {
    return {
      kind: 'url_contains',
      expected: step.value,
    };
  }

  return null;
}

function requiresLocator(step = {}) {
  return ['click', 'fill', 'press', 'select', 'check', 'capture', 'assert_text'].includes(step.type);
}

function isActionStep(step = {}) {
  return ['navigate', 'click', 'fill', 'press', 'select', 'check', 'wait_for'].includes(step.type);
}

function evaluateExpectedStateChange(step = {}, source = {}) {
  const expected = step.expectedStateChange ?? null;
  const stepObservation = step.stability?.observation ?? null;
  const observedKind = step.stability?.trigger ?? 'no_change';
  const observedNewText = stepObservation?.newText ?? [];
  const observedUrl = step.currentUrl ?? step.url ?? source.finalUrl ?? '';

  if (!expected) {
    return {
      required: false,
      passed: null,
      observedKind,
      reason: null,
    };
  }

  let passed = true;
  let reason = null;
  const kind = expected.kind ?? 'any';

  if (kind === 'url_change' && observedKind !== 'url_change') {
    passed = false;
    reason = 'url_change_not_observed';
  } else if (kind === 'dom_change' && observedKind === 'no_change') {
    passed = false;
    reason = 'dom_change_not_observed';
  } else if (kind === 'text_change' && observedNewText.length === 0) {
    passed = false;
    reason = 'text_change_not_observed';
  } else if (kind === 'no_change' && observedKind !== 'no_change') {
    passed = false;
    reason = 'unexpected_change_observed';
  }

  if (passed && expected.urlIncludes && !String(observedUrl).includes(expected.urlIncludes)) {
    passed = false;
    reason = 'expected_url_fragment_missing';
  }

  if (
    passed &&
    expected.textIncludes &&
    !observedNewText.some((entry) => String(entry ?? '').includes(expected.textIncludes))
  ) {
    passed = false;
    reason = 'expected_text_fragment_missing';
  }

  return {
    required: true,
    passed,
    observedKind,
    reason,
  };
}

function createExpectedStateFailure(stepIndex, evaluation, step, source) {
  return {
    code: 'EXPECTED_STATE_CHANGE_NOT_OBSERVED',
    message: `Expected state change was not observed for step ${stepIndex + 1}`,
    stepIndex,
    action: step.type,
    details: {
      expectedStateChange: step.expectedStateChange ?? null,
      observedKind: evaluation.observedKind,
      reason: evaluation.reason,
      finalUrl: source.finalUrl ?? null,
      newText: source.observation?.newText ?? [],
    },
  };
}

async function chooseVerifiedLocator(step = {}, ranking = null, page) {
  const initialSelection = chooseLocator(step, ranking);
  const candidates = [initialSelection.locatorChoice, ...(initialSelection.fallbackLocatorChoices ?? [])].filter(Boolean);
  const existingCandidates = [
    ...(step.codegenVerification ? [step.codegenVerification] : []),
    ...(step.verification?.candidates ?? []),
  ];
  const usage = step.type === 'assert_text' ? 'capture' : step.type;

  for (const locator of candidates) {
    const existing = existingCandidates.find(
      (candidate) => JSON.stringify(candidate.locator) === JSON.stringify(locator)
    );
    if (existing?.unique === true && existing?.usable === true) {
      return {
        locatorChoice: existing.locator ?? locator,
        fallbackLocatorChoices: candidates.filter(
          (candidate) => JSON.stringify(candidate) !== JSON.stringify(existing.locator ?? locator)
        ),
        verification: existing,
      };
    }

    const result = await verifyLocatorCandidate(page, locator, usage).catch(() => null);
    if (result?.inspection?.unique === true && result?.inspection?.usable === true) {
      const verifiedLocator = result.inspection.locator ?? locator;
      return {
        locatorChoice: verifiedLocator,
        fallbackLocatorChoices: candidates.filter(
          (candidate) => JSON.stringify(candidate) !== JSON.stringify(verifiedLocator)
        ),
        verification: result.inspection,
      };
    }
  }

  return {
    ...initialSelection,
    verification:
      existingCandidates.find(
        (candidate) => JSON.stringify(candidate.locator) === JSON.stringify(initialSelection.locatorChoice)
      ) ?? null,
  };
}

async function normalizeValidatedStep(step = {}, validationScan = null, page) {
  const ranking = normalizeRanking(step, validationScan);
  const locatorSelection = await chooseVerifiedLocator(step, ranking, page);

  return {
    ...step,
    validatedLocator: step.locator ?? null,
    locatorChoice: locatorSelection.locatorChoice,
    fallbackLocatorChoices: locatorSelection.fallbackLocatorChoices,
    locatorRanking: ranking?.matches ?? [],
    semanticTarget: step.semanticTarget ?? ranking?.matches?.[0]?.element ?? null,
    stableFingerprint: step.stableFingerprint ?? ranking?.matches?.[0]?.stableFingerprint ?? null,
    confidence: step.confidence ?? ranking?.matches?.[0]?.confidence ?? null,
    assertionPlan: buildAssertionPlan(step),
    expectedStateChange: step.expectedStateChange ?? null,
    codegenVerification: locatorSelection.verification ?? step.codegenVerification ?? null,
  };
}

export async function buildValidationResult({ sessionId, before, after, observation, result, page } = {}) {
  const validationScan = await collectStructuredPageData(page, {
    detailLevel: 'standard',
    includeSpecializedControls: true,
  }).catch(() => null);
  const steps = [];
  for (const step of result.steps ?? []) {
    steps.push(await normalizeValidatedStep(step, validationScan, page));
  }
  const source = {
    sessionId,
    startUrl: before?.url ?? null,
    finalUrl: result.finalUrl ?? after?.url ?? null,
    finalTitle: result.finalTitle ?? after?.title ?? null,
  };
  const stepEvidence = steps.map((step, index) => {
    const expectedStateEvaluation = evaluateExpectedStateChange(step, {
      observation,
      finalUrl: source.finalUrl,
    });

    return {
      stepIndex: index,
      type: step.type,
      locatorResolved: requiresLocator(step) ? Boolean(step.locatorChoice ?? step.locator) : null,
      uniqueMatch: step.codegenVerification?.unique ?? null,
      actionExecuted: isActionStep(step) ? step.ok !== false : null,
      assertionPassed: step.type.startsWith('assert_') ? step.ok !== false : null,
      expectedStateChange: step.expectedStateChange ?? null,
      expectedStateEvaluation,
      stability: step.stability ?? null,
    };
  });
  const expectedStateFailure = stepEvidence.find(
    (entry) => entry.expectedStateEvaluation.required === true && entry.expectedStateEvaluation.passed !== true
  );
  const validatedLocatorSteps = steps.filter((step) => step.locatorChoice);
  const semanticLocatorSteps = validatedLocatorSteps.filter((step) => step.locatorChoice?.strategy !== 'css');
  const cssFallbackSteps = validatedLocatorSteps.filter((step) => step.locatorChoice?.strategy === 'css');
  const uniqueLocatorHits = validatedLocatorSteps.filter(
    (step) => step.codegenVerification?.unique === true && step.codegenVerification?.usable === true
  ).length;
  const locatorRelevantSteps = stepEvidence.filter((entry) => entry.locatorResolved !== null);
  const assertionSteps = stepEvidence.filter((entry) => entry.assertionPassed !== null);
  const actionSteps = stepEvidence.filter((entry) => entry.actionExecuted !== null);
  const locatorResolved =
    locatorRelevantSteps.length === 0 ? null : locatorRelevantSteps.every((entry) => entry.locatorResolved === true);
  const uniqueMatch =
    locatorRelevantSteps.length === 0 ? null : locatorRelevantSteps.every((entry) => entry.uniqueMatch === true);
  const actionExecuted = actionSteps.length === 0 ? null : actionSteps.every((entry) => entry.actionExecuted === true);
  const assertionsPassed =
    assertionSteps.length === 0 ? null : assertionSteps.every((entry) => entry.assertionPassed === true);
  const stateChanged = expectedStateFailure ? false : stepEvidence.some((entry) => entry.expectedStateEvaluation.passed === true)
    ? true
    : observation?.urlChanged === true ||
      observation?.documentChanged === true ||
      (Array.isArray(observation?.newText) && observation.newText.length > 0);
  const failureKind = expectedStateFailure ? 'EXPECTED_STATE_CHANGE_NOT_OBSERVED' : result.ok ? null : result.error?.code ?? 'ACTION_STEP_FAILED';
  const effectiveError =
    expectedStateFailure && result.ok
      ? createExpectedStateFailure(expectedStateFailure.stepIndex, expectedStateFailure.expectedStateEvaluation, steps[expectedStateFailure.stepIndex], {
          observation,
          finalUrl: source.finalUrl,
        })
      : result.ok
        ? null
        : result.error ?? null;
  const passed = result.ok === true && !expectedStateFailure;

  const metrics = {
    semanticLocatorRatio:
      validatedLocatorSteps.length === 0 ? null : Number((semanticLocatorSteps.length / validatedLocatorSteps.length).toFixed(2)),
    cssFallbackRatio:
      validatedLocatorSteps.length === 0 ? null : Number((cssFallbackSteps.length / validatedLocatorSteps.length).toFixed(2)),
    uniqueLocatorHitRate:
      validatedLocatorSteps.length === 0 ? null : Number((uniqueLocatorHits / validatedLocatorSteps.length).toFixed(2)),
    locatorCount: validatedLocatorSteps.length,
    semanticLocatorCount: semanticLocatorSteps.length,
    cssFallbackCount: cssFallbackSteps.length,
    uniqueLocatorHitCount: uniqueLocatorHits,
    actionCount: countActionSteps(steps, (step) => !step.type.startsWith('assert_') && step.type !== 'capture'),
    assertionCount: countActionSteps(steps, (step) => step.type.startsWith('assert_')),
  };

  return {
    ok: true,
    locatorResolved,
    uniqueMatch,
    actionExecuted,
    stateChanged,
    assertionsPassed,
    failureKind,
    validation: {
      passed,
      firstPass: true,
      repaired: false,
      metrics,
    },
    source,
    observation,
    evidence: {
      observation,
      steps: stepEvidence,
    },
    scan: validationScan,
    steps,
    error: effectiveError,
  };
}

export function buildRepairCandidate({ steps = [], failedStepIndex = -1, scan = null } = {}) {
  if (!Array.isArray(steps) || failedStepIndex < 0 || failedStepIndex >= steps.length || !scan) {
    return null;
  }

  const nextSteps = steps.map((step) => ({ ...step }));
  const targetStep = nextSteps[failedStepIndex];

  if (!targetStep.locator && !targetStep.locatorChoice) {
    return null;
  }

  const currentLocator = targetStep.locatorChoice ?? targetStep.locator;
  const target = {
    ...deriveSemanticTargetFromLocator(currentLocator),
    ...deriveSemanticTargetFromLocator(targetStep.fallbackLocatorChoices?.[0]),
  };
  const ranking = rankSemanticTarget(scan, target, { limit: 5 });
  const currentKey = JSON.stringify(currentLocator);
  const nextLocator = ranking.matches
    .flatMap((match) => [match.preferredLocator, ...(match.fallbackLocators ?? [])])
    .filter(Boolean)
    .find((locator) => JSON.stringify(locator) !== currentKey);

  if (!nextLocator) {
    return null;
  }

  const alternativeLocators = ranking.matches
    .flatMap((match) => [match.preferredLocator, ...(match.fallbackLocators ?? [])])
    .filter(Boolean)
    .filter((locator) => JSON.stringify(locator) !== JSON.stringify(nextLocator));

  targetStep.locator = nextLocator;
  targetStep.fallbackLocators = alternativeLocators;
  targetStep.stability = targetStep.stability ?? {
    settleMs: 160,
    minObserveMs: 480,
    timeoutMs: 2500,
  };

  return {
    repairedSteps: nextSteps,
    repairs: [
      {
        stepIndex: failedStepIndex,
        kind: 'locator_reordered',
        locatorChoice: nextLocator,
        fallbackLocatorChoices: alternativeLocators,
      },
    ],
  };
}
