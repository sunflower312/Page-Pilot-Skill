import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const waitForReadyStateScript = `
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const delayedElement = document.querySelector('[data-testid="delayed-element"]');
    const delayedVisible = Boolean(delayedElement && (delayedElement.offsetWidth || delayedElement.offsetHeight || delayedElement.getClientRects().length));
    const enabledButton = document.querySelector('[data-testid="btn-enable-after-delay"]');
    const buttonEnabled = Boolean(enabledButton && !enabledButton.disabled);
    if (delayedVisible && buttonEnabled) {
      return {
        delayedText: delayedElement.textContent.trim(),
        buttonText: enabledButton.textContent.trim(),
        buttonEnabled,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the delayed element and enabled button.');
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the dynamic waits practice page', 'brief');
        await runActions(context, sessionId, 'Trigger two delayed UI states', [
          { type: 'click', locator: { strategy: 'testId', value: 'btn-show-element' } },
          { type: 'click', locator: { strategy: 'testId', value: 'btn-activate-trigger' } },
        ]);
        const verification = await executeScript(
          context,
          sessionId,
          'Wait for the delayed element and enabled button',
          waitForReadyStateScript,
          (data) => ({
            delayedText: data.delayedText,
            buttonText: data.buttonText,
            buttonEnabled: data.buttonEnabled,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'qa-playground-dynamic-waits'));
        return {
          summary: 'Verified delayed visibility and delayed enablement on the QA Playground waits page.',
          details: verification.data,
        };
      },
      { url: 'https://www.qaplayground.com/practice/dynamic-waits' }
    );

    return finalizeScenario(sessionRun);
  },
};
