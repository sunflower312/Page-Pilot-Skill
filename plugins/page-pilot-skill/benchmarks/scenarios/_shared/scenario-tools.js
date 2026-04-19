function summarizeObservation(observation = {}) {
  return {
    urlChanged: observation.urlChanged === true,
    titleChanged: observation.titleChanged === true,
    documentChanged: observation.documentChanged === true,
    newText: Array.isArray(observation.newText) ? observation.newText.slice(0, 5) : [],
    removedText: Array.isArray(observation.removedText) ? observation.removedText.slice(0, 5) : [],
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

export async function runActions(context, sessionId, title, actions) {
  const response = await context.callTool('browser_run_actions', { sessionId, actions });
  context.recordStep(title, 'passed', {
    actionCount: actions.length,
    finalUrl: response.finalUrl ?? null,
    finalTitle: response.finalTitle ?? null,
    observation: summarizeObservation(response.observation),
  });
  return response;
}

export async function executeScript(context, sessionId, title, script, summarizeData = null) {
  const response = await context.callTool('browser_execute_js', { sessionId, script });
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
