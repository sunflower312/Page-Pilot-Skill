function summarizeObservation(observation = {}) {
  return {
    urlChanged: observation.urlChanged === true,
    titleChanged: observation.titleChanged === true,
    documentChanged: observation.documentChanged === true,
    newText: Array.isArray(observation.newText) ? observation.newText.slice(0, 5) : [],
    removedText: Array.isArray(observation.removedText) ? observation.removedText.slice(0, 5) : [],
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

export async function validatePlaywright(context, sessionId, title, steps) {
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

  const generated = await context.callTool('browser_generate_playwright', {
    sessionId,
    testName: `${context.site.id}-${context.scenario.id}`,
    includeImports: false,
    includeTestWrapper: false,
  });
  const generatedStartUrl = generated.source?.startUrl ?? context.scenario.entryUrl ?? context.site.baseUrl;
  const generatedSession = await context.openSession({ url: generatedStartUrl });
  let generatedValidation;

  try {
    generatedValidation = await context.callTool('browser_validate_playwright_code', {
      sessionId: generatedSession.sessionId,
      code: generated.code,
    });
  } finally {
    await context.closeSession(generatedSession.sessionId);
  }

  const codeQuality = buildCodeQuality({
    validation,
    generated,
    generatedValidation,
    firstValidationPassed,
    repaired: validation.validation?.repaired === true,
  });

  if (generatedValidation.ok !== true) {
    context.recordStep(title, 'failed', {
      stepCount: steps.length,
      finalUrl: validation.source?.finalUrl ?? null,
      finalTitle: validation.source?.finalTitle ?? null,
      observation: summarizeObservation(validation.observation),
      codeQuality,
      generatedCode: generated.code,
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
    generatedCode: generated.code,
    generatedValidation: {
      ok: generatedValidation.ok,
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

export async function runProbe(context, sessionId, title, probeOrSource, summarizeData = null, options = {}) {
  const defaultTimeoutMs = typeof probeOrSource === 'string' ? 20000 : 3000;
  const response =
    typeof probeOrSource === 'string'
      ? await context.callTool('browser_probe_script', {
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
