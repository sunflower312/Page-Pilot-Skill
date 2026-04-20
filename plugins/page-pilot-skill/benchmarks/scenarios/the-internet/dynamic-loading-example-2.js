import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const waitForHelloWorldScript = `
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const text = document.querySelector('#finish h4')?.textContent?.trim() ?? '';
    if (text === 'Hello World!') {
      return {
        text,
        loadingVisible: Boolean(document.querySelector('#loading')),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for Hello World! to appear.');
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the dynamic-loading example page', 'brief');
        await validatePlaywright(context, sessionId, 'Start the delayed loading example', [
          { type: 'click', locator: { strategy: 'css', value: '#start button' } },
        ]);
        const verification = await runProbe(
          context,
          sessionId,
          'Wait for Hello World to appear',
          waitForHelloWorldScript,
          (data) => ({
            text: data.text,
            loadingVisible: data.loadingVisible,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'the-internet-dynamic-loading'));
        return {
          summary: 'Started the delayed-loading example and verified the Hello World completion state.',
          details: verification.data,
        };
      },
      { url: 'https://the-internet.herokuapp.com/dynamic_loading/2' }
    );

    return finalizeScenario(sessionRun);
  },
};
