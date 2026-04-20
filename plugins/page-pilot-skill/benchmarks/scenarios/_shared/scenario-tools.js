function summarizeObservation(observation = {}) {
  return {
    urlChanged: observation.urlChanged === true,
    titleChanged: observation.titleChanged === true,
    documentChanged: observation.documentChanged === true,
    newText: Array.isArray(observation.newText) ? observation.newText.slice(0, 5) : [],
    removedText: Array.isArray(observation.removedText) ? observation.removedText.slice(0, 5) : [],
  };
}

function splitValidationBatches(steps = [], maxSteps = 12) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [];
  }

  const batches = [];
  for (let index = 0; index < steps.length; index += maxSteps) {
    batches.push(steps.slice(index, index + maxSteps));
  }
  return batches;
}

function buildGeneratedValidationMetrics(batchResults = []) {
  const totals = batchResults.reduce(
    (accumulator, result) => {
      const metrics = result?.validation?.metrics ?? {};
      accumulator.locatorCount += metrics.locatorCount ?? 0;
      accumulator.semanticLocatorCount += metrics.semanticLocatorCount ?? 0;
      accumulator.cssFallbackCount += metrics.cssFallbackCount ?? 0;
      accumulator.uniqueLocatorHitCount += metrics.uniqueLocatorHitCount ?? 0;
      return accumulator;
    },
    {
      locatorCount: 0,
      semanticLocatorCount: 0,
      cssFallbackCount: 0,
      uniqueLocatorHitCount: 0,
    }
  );

  return {
    ...totals,
    semanticLocatorRatio:
      totals.locatorCount === 0 ? null : Number((totals.semanticLocatorCount / totals.locatorCount).toFixed(2)),
    cssFallbackRatio:
      totals.locatorCount === 0 ? null : Number((totals.cssFallbackCount / totals.locatorCount).toFixed(2)),
    uniqueLocatorHitRate:
      totals.locatorCount === 0 ? null : Number((totals.uniqueLocatorHitCount / totals.locatorCount).toFixed(2)),
  };
}

async function validateGeneratedPlan(context, sessionId, generatedPlan = []) {
  const batches = splitValidationBatches(generatedPlan);
  if (batches.length === 0) {
    const error = new Error('Generated Playwright response did not include a non-empty generatedPlan');
    error.code = 'GENERATED_PLAN_MISSING';
    throw error;
  }

  const batchResults = [];

  for (const batch of batches) {
    const result = await context.callTool('browser_validate_playwright', {
      sessionId,
      steps: batch,
    });

    if (result.ok !== true) {
      return {
        ...result,
        ok: false,
      };
    }

    batchResults.push(result);
  }

  const lastResult = batchResults.at(-1);
  return {
    ...lastResult,
    ok: true,
    validation: {
      ...(lastResult?.validation ?? {}),
      metrics: buildGeneratedValidationMetrics(batchResults),
    },
    batchCount: batchResults.length,
  };
}

function buildCodeQuality({
  validation = null,
  generated = null,
  generatedValidation = null,
  firstValidationPassed = false,
  repaired = false,
} = {}) {
  const locatorCount =
    generated?.metrics?.locatorCount ??
    validation?.validation?.metrics?.locatorCount ??
    validation?.steps?.filter((step) => step.locatorChoice).length ??
    0;
  const semanticLocatorCount =
    generated?.locatorChoices?.filter((choice) => choice.locator?.strategy !== 'css').length ??
    validation?.validation?.metrics?.semanticLocatorCount ??
    validation?.steps?.filter((step) => step.locatorChoice?.strategy !== 'css').length ??
    0;
  const cssFallbackCount =
    generated?.locatorChoices?.filter((choice) => choice.locator?.strategy === 'css').length ??
    validation?.validation?.metrics?.cssFallbackCount ??
    validation?.steps?.filter((step) => step.locatorChoice?.strategy === 'css').length ??
    0;
  const uniqueLocatorHitCount =
    generatedValidation?.validation?.metrics?.uniqueLocatorHitCount ??
    validation?.validation?.metrics?.uniqueLocatorHitCount ??
    validation?.steps?.filter((step) => step.codegenVerification?.unique === true && step.codegenVerification?.usable === true).length ??
    0;

  return {
    evidenceScope: generated ? 'cumulative_session_validation_evidence' : 'single_validation_batch',
    semanticLocatorRatio:
      generated?.metrics?.semanticLocatorRatio ?? validation?.validation?.metrics?.semanticLocatorRatio ?? null,
    cssFallbackRatio:
      generated?.metrics?.cssFallbackRatio ?? validation?.validation?.metrics?.cssFallbackRatio ?? null,
    uniqueLocatorHitRate:
      generatedValidation?.validation?.metrics?.uniqueLocatorHitRate ?? validation?.validation?.metrics?.uniqueLocatorHitRate ?? null,
    locatorCount,
    semanticLocatorCount,
    cssFallbackCount,
    uniqueLocatorHitCount,
    firstValidationPassed,
    generatedValidationPassed: generatedValidation?.ok === true,
    generatedValidationScope: generatedValidation ? 'cumulative_generated_plan' : 'not_attempted',
    repaired,
    codeLineCount: generated?.metrics?.codeLineCount ?? null,
  };
}

export async function withScenarioSession(context, callback, options = {}) {
  const artifacts = [];
  const payload = await context.withSession(options, async (sessionId, session) => {
    context.recordStep('Open target page', 'passed', {
      url: session.url ?? options.url ?? context.scenario.entryUrl ?? context.site.baseUrl,
      title: session.title ?? null,
    });
    return await callback({
      sessionId,
      session,
      artifacts,
      addArtifact(artifact) {
        artifacts.push(artifact);
      },
    });
  });

  return {
    artifacts,
    payload: payload ?? {},
  };
}

export async function scanPage(context, sessionId, title, detailLevel = 'brief') {
  const response = await context.callTool('browser_scan', { sessionId, detailLevel });
  context.recordStep(title, 'passed', {
    url: response.url ?? null,
    title: response.title ?? null,
    detailLevel,
  });
  return response;
}

export async function validatePlaywright(context, sessionId, title, steps, options = {}) {
  let validation = await context.callTool('browser_validate_playwright', { sessionId, steps });
  let repair = null;
  const firstValidationPassed = validation.ok === true;

  if (validation.ok !== true) {
    repair = await context.callTool('browser_repair_playwright', { sessionId, steps });
    if (repair.ok === true) {
      validation = repair;
    }
  }

  if (validation.ok !== true) {
    context.recordStep(title, 'failed', {
      stepCount: steps.length,
      finalUrl: validation.source?.finalUrl ?? null,
      finalTitle: validation.source?.finalTitle ?? null,
      observation: summarizeObservation(validation.observation),
      codeQuality: buildCodeQuality({
        validation,
        firstValidationPassed,
        repaired: false,
      }),
      generatedValidation: {
        ok: false,
        failureKind: validation.failureKind ?? validation.error?.code ?? null,
        stateChanged: validation.stateChanged ?? null,
      },
    });
    const error = new Error(validation.error?.message ?? 'Playwright validation failed');
    error.code = validation.error?.code ?? 'BENCHMARK_VALIDATION_FAILED';
    error.details = validation;
    throw error;
  }

  let generated = null;
  let generatedValidation = {
    ok: null,
    skipped: true,
    reason: 'intermediate_batch_validation',
  };

  if (options.skipGeneratedValidation !== true) {
    generated = await context.callTool('browser_generate_playwright', {
      sessionId,
      testName: `${context.site.id}-${context.scenario.id}`,
      includeImports: false,
      includeTestWrapper: false,
    });
    const generatedStartUrl = generated.source?.startUrl ?? context.scenario.entryUrl ?? context.site.baseUrl;
    const generatedSession = await context.openSession({ url: generatedStartUrl });

    try {
      generatedValidation = await validateGeneratedPlan(context, generatedSession.sessionId, generated.generatedPlan);
    } finally {
      await context.closeSession(generatedSession.sessionId);
    }
  }

  const codeQuality = buildCodeQuality({
    validation,
    generated,
    generatedValidation: generatedValidation.ok === true ? generatedValidation : null,
    firstValidationPassed,
    repaired: validation.validation?.repaired === true,
  });

  if (generatedValidation.ok === false) {
    context.recordStep(title, 'failed', {
      stepCount: steps.length,
      finalUrl: validation.source?.finalUrl ?? null,
      finalTitle: validation.source?.finalTitle ?? null,
      observation: summarizeObservation(validation.observation),
      codeQuality,
      generatedCode: generated?.code ?? null,
      generatedValidation: {
        ok: false,
        failureKind: generatedValidation.failureKind ?? generatedValidation.error?.code ?? null,
        stateChanged: generatedValidation.stateChanged ?? null,
      },
    });
    const error = new Error(generatedValidation.error?.message ?? 'Generated Playwright validation failed');
    error.code = generatedValidation.failureKind ?? generatedValidation.error?.code ?? 'GENERATED_PLAYWRIGHT_VALIDATION_FAILED';
    error.details = generatedValidation;
    throw error;
  }

  context.recordStep(title, 'passed', {
    stepCount: steps.length,
    finalUrl: validation.source?.finalUrl ?? null,
    finalTitle: validation.source?.finalTitle ?? null,
    observation: summarizeObservation(validation.observation),
    codeQuality,
    generatedCode: generated?.code ?? null,
    generatedValidation: {
      ok: generatedValidation.ok,
      skipped: generatedValidation.skipped === true,
      reason: generatedValidation.reason ?? null,
      failureKind: generatedValidation.failureKind ?? null,
      stateChanged: generatedValidation.stateChanged ?? null,
    },
  });

  return {
    ...validation,
    generated,
    generatedValidation,
    repair,
    codeQuality,
  };
}

export async function validatePlaywrightBatches(context, sessionId, title, batches) {
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    await validatePlaywright(
      context,
      sessionId,
      batches.length === 1 ? title : `${title} (${index + 1}/${batches.length})`,
      batch,
      { skipGeneratedValidation: index < batches.length - 1 }
    );
  }
}

export async function runProbe(context, sessionId, title, probeOrSource, summarizeData = null, options = {}) {
  const defaultTimeoutMs = typeof probeOrSource === 'string' ? 20000 : 3000;
  const response =
    typeof probeOrSource === 'string'
      ? await context.callTool('browser_probe_script_internal', {
          sessionId,
          source: probeOrSource,
          timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
        })
      : await context.callTool('browser_probe', {
          sessionId,
          probe: {
            ...probeOrSource,
            timeoutMs: probeOrSource?.timeoutMs ?? options.timeoutMs ?? defaultTimeoutMs,
          },
        });
  context.recordStep(
    title,
    'passed',
    typeof summarizeData === 'function' ? summarizeData(response.data) : { result: response.data }
  );
  return response;
}

export async function captureScreenshot(context, sessionId, label, fullPage = false) {
  const response = await context.callTool('browser_capture_screenshot', { sessionId, fullPage });
  context.recordStep(`Capture ${label} screenshot`, 'passed', { path: response.path });
  return {
    type: 'screenshot',
    label,
    path: response.path,
  };
}

export function finalizeScenario(sessionRun, fallbackSummary = 'Benchmark scenario completed.') {
  return {
    summary: sessionRun.payload.summary ?? fallbackSummary,
    details: sessionRun.payload.details ?? null,
    artifacts: sessionRun.artifacts,
  };
}
