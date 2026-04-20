import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const waitForToastScript = `
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const toast = document.querySelector('[data-sonner-toast]');
    const text = toast?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
    if (toast && text) {
      return {
        text,
        id: toast.id || null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for the toast alert to appear.');
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the alerts and dialogs page', 'brief');
        await validatePlaywright(context, sessionId, 'Trigger the toast alert', [
          { type: 'click', locator: { strategy: 'testId', value: 'btn-toast-alert' } },
        ]);
        const verification = await runProbe(
          context,
          sessionId,
          'Wait for the toast alert',
          waitForToastScript,
          (data) => ({ text: data.text, id: data.id })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'qa-playground-alerts-dialogs-toast'));
        return {
          summary: 'Triggered the QA Playground toast alert and verified its rendered message.',
          details: verification.data,
        };
      },
      { url: 'https://www.qaplayground.com/practice/alerts-dialogs' }
    );

    return finalizeScenario(sessionRun);
  },
};
