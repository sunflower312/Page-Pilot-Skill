export function storeValidation(session, validation, originalSteps) {
  const storedValidation = {
    ...validation,
    originalSteps,
  };
  session.lastValidation = storedValidation;
  if (!Array.isArray(session.validationHistory)) {
    session.validationHistory = [];
  }
  if (storedValidation.validation?.passed) {
    session.validationHistory.push(storedValidation);
  }
  return session.lastValidation;
}

export function shouldAttemptLocatorRepair(validation) {
  if (!validation || validation.validation?.passed) {
    return false;
  }

  if (validation.failureKind !== 'ACTION_STEP_FAILED') {
    return false;
  }

  const failedStepIndex = validation.error?.stepIndex;
  const failedStep = Number.isInteger(failedStepIndex) ? validation.steps?.[failedStepIndex] : null;
  const originalFailedStep = Number.isInteger(failedStepIndex) ? validation.originalSteps?.[failedStepIndex] : null;
  if (!failedStep && !originalFailedStep) {
    return false;
  }

  const failedType = failedStep?.type ?? originalFailedStep?.type;
  if (!['click', 'fill', 'press', 'select', 'check', 'capture'].includes(failedType)) {
    return false;
  }

  return (
    Array.isArray(validation.error?.details?.candidates) ||
    ((failedStep?.fallbackLocatorChoices ?? []).length > 0) ||
    failedStep?.codegenVerification?.unique !== true ||
    failedStep?.codegenVerification?.usable !== true ||
    Boolean(originalFailedStep?.locator)
  );
}

export function buildSessionValidationEvidence(session) {
  const history = Array.isArray(session.validationHistory)
    ? session.validationHistory.filter((entry) => entry?.validation?.passed)
    : [];
  const evidenceEntries =
    history.length > 0
      ? history
      : session.lastValidation?.validation?.passed
        ? [session.lastValidation]
        : [];

  if (evidenceEntries.length === 0) {
    return null;
  }

  const combinedSteps = evidenceEntries.flatMap((entry) => entry.steps ?? []);
  const combinedEvidenceSteps = [];
  for (const entry of evidenceEntries) {
    for (const evidenceStep of entry.evidence?.steps ?? []) {
      combinedEvidenceSteps.push({
        ...evidenceStep,
        stepIndex: combinedEvidenceSteps.length,
      });
    }
  }

  const locatorSteps = combinedSteps.filter((step) => step.locatorChoice);
  const semanticLocatorSteps = locatorSteps.filter((step) => step.locatorChoice?.strategy !== 'css');
  const cssFallbackSteps = locatorSteps.filter((step) => step.locatorChoice?.strategy === 'css');
  const uniqueLocatorHits = locatorSteps.filter(
    (step) => step.codegenVerification?.unique === true && step.codegenVerification?.usable === true
  ).length;
  const actionCount = evidenceEntries.reduce((sum, entry) => sum + (entry.validation?.metrics?.actionCount ?? 0), 0);
  const assertionCount = evidenceEntries.reduce(
    (sum, entry) => sum + (entry.validation?.metrics?.assertionCount ?? 0),
    0
  );

  return {
    ...evidenceEntries[evidenceEntries.length - 1],
    source: {
      ...evidenceEntries[evidenceEntries.length - 1].source,
      startUrl: evidenceEntries[0].source?.startUrl ?? evidenceEntries[evidenceEntries.length - 1].source?.startUrl ?? null,
    },
    validation: {
      passed: true,
      firstPass: evidenceEntries.every((entry) => entry.validation?.firstPass === true),
      repaired: evidenceEntries.some((entry) => entry.validation?.repaired === true),
      metrics: {
        semanticLocatorRatio:
          locatorSteps.length === 0 ? null : Number((semanticLocatorSteps.length / locatorSteps.length).toFixed(2)),
        cssFallbackRatio:
          locatorSteps.length === 0 ? null : Number((cssFallbackSteps.length / locatorSteps.length).toFixed(2)),
        uniqueLocatorHitRate:
          locatorSteps.length === 0 ? null : Number((uniqueLocatorHits / locatorSteps.length).toFixed(2)),
        actionCount,
        assertionCount,
      },
    },
    evidence: {
      observation: evidenceEntries[evidenceEntries.length - 1].observation ?? null,
      steps: combinedEvidenceSteps,
    },
    steps: combinedSteps,
    error: null,
  };
}
