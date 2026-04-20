import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const readProgressStateScript = `
  const progressBar = document.querySelector('#progressBar');
  const result = document.querySelector('#result');
  if (!progressBar || !result) {
    throw new Error('The progress bar state is unavailable.');
  }
  return {
    value: Number(progressBar.getAttribute('aria-valuenow') ?? '-1'),
    label: progressBar.textContent?.trim() ?? null,
    resultText: result.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
  };
`;

async function waitForProgressTarget(context, sessionId, target = 60, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await runProbe(
      context,
      sessionId,
      'Read the current progress-bar state',
      readProgressStateScript,
      (data) => ({ value: data.value, resultText: data.resultText })
    );
    if (Number.isFinite(state.data.value) && state.data.value >= target) {
      return state.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for the progress bar to reach ${target}%.`);
}

async function waitForProgressAdvance(context, sessionId, initialValue, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await runProbe(
      context,
      sessionId,
      'Read the current progress-bar state',
      readProgressStateScript,
      (data) => ({ value: data.value, resultText: data.resultText })
    );
    if (Number.isFinite(state.data.value) && state.data.value > initialValue) {
      return state.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  return null;
}

const verifyStoppedProgressScript = `
  const progressBar = document.querySelector('#progressBar');
  const result = document.querySelector('#result');
  if (!progressBar || !result) {
    throw new Error('The stopped progress-bar state is unavailable.');
  }
  const stoppedValue = Number(progressBar.getAttribute('aria-valuenow') ?? '-1');
  const resultText = result.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
  if (!Number.isFinite(stoppedValue)) {
    throw new Error('The stopped progress value is not numeric.');
  }
  if (stoppedValue >= 100) {
    throw new Error('The progress bar ran to completion instead of stopping near the target.');
  }
  if (stoppedValue < 60 || stoppedValue > 90) {
    throw new Error(\`Expected to stop inside the 60-90 band, got \${stoppedValue}.\`);
  }
  if (!resultText.includes('Result:')) {
    throw new Error('The page did not render the Result summary after stopping.');
  }
  const resultMatch = resultText.match(/Result:\\s*(-?\\d+)/);
  const resultValue = resultMatch ? Number(resultMatch[1]) : NaN;
  if (!Number.isFinite(resultValue) || Math.abs(resultValue) > 15) {
    throw new Error(\`Expected the result score to stay within 15 points, got "\${resultText}".\`);
  }
  return {
    stoppedValue,
    delta: Math.abs(stoppedValue - 75),
    resultValue,
    resultText,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the progress bar page', 'brief');
        const before = await runProbe(
          context,
          sessionId,
          'Record the initial progress-bar state',
          readProgressStateScript,
          (data) => ({ value: data.value, resultText: data.resultText })
        );
        await validatePlaywright(context, sessionId, 'Start the progress bar', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Start' } } },
        ]);
        const started = await waitForProgressAdvance(context, sessionId, before.data.value);
        if (!started) {
          await validatePlaywright(context, sessionId, 'Retry starting the progress bar with a second button click', [
            { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Start' } } },
          ]);
          const retriedStart = await waitForProgressAdvance(context, sessionId, before.data.value);
          if (!retriedStart) {
            throw new Error('The progress bar never advanced after two start attempts.');
          }
        }
        const nearTarget = await waitForProgressTarget(context, sessionId);
        await validatePlaywright(context, sessionId, 'Stop the progress bar near the target', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Stop' } } },
        ]);
        const after = await runProbe(
          context,
          sessionId,
          'Verify the stopped progress-bar state',
          verifyStoppedProgressScript,
          (data) => data
        );
        addArtifact(await captureScreenshot(context, sessionId, 'ui-testing-playground-progressbar-stop'));
        return {
          summary: `Stopped the progress bar ${after.data.delta} point(s) away from the 75% target.`,
          details: {
            before: before.data,
            nearTarget,
            after: after.data,
          },
        };
      },
      { url: 'http://uitestingplayground.com/progressbar' }
    );

    return finalizeScenario(sessionRun);
  },
};
