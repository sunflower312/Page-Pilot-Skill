import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const waitForAjaxLabelScript = `
  const deadline = Date.now() + 17000;
  while (Date.now() < deadline) {
    const label = document.querySelector('.bg-success');
    const text = label?.textContent?.trim() ?? '';
    if (text.includes('Data loaded with AJAX get request.')) {
      return {
        text,
        count: document.querySelectorAll('.bg-success').length,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the delayed AJAX label.');
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(context, async ({ sessionId, addArtifact }) => {
      await scanPage(context, sessionId, 'Scan the AJAX waiting page', 'brief');
      await runActions(context, sessionId, 'Trigger the delayed AJAX request', [
        {
          type: 'click',
          locator: { strategy: 'role', value: { role: 'button', name: 'Button Triggering AJAX Request' } },
        },
      ]);
      const verification = await executeScript(
        context,
        sessionId,
        'Wait for the delayed AJAX label',
        waitForAjaxLabelScript,
        (data) => ({
          text: data.text,
          count: data.count,
        })
      );
      addArtifact(await captureScreenshot(context, sessionId, 'ui-testing-playground-ajax-result'));
      return {
        summary: 'Observed the delayed AJAX success label.',
        details: verification.data,
      };
    });

    return finalizeScenario(sessionRun);
  },
};
