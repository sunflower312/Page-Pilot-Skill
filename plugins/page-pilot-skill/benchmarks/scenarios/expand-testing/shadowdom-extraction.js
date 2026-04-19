import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractShadowDomScript = `
  const host = document.querySelector('#shadow-host');
  const root = host?.shadowRoot;
  const button = root?.querySelector('#my-btn');
  const shadowText = root?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
  if (!root) {
    throw new Error('The Expand Testing shadow host does not expose an open shadow root.');
  }
  if (!button) {
    throw new Error('The shadow-root button is missing.');
  }
  if (!shadowText.includes('This button is inside a Shadow DOM.')) {
    throw new Error('The shadow-root text is missing the expected sample content.');
  }
  return {
    buttonText: button.textContent.trim(),
    shadowText,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the Expand Testing shadow DOM page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract text and button label from the shadow DOM component',
          extractShadowDomScript,
          (data) => ({
            buttonText: data.buttonText,
            shadowText: data.shadowText.slice(0, 80),
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'expand-testing-shadowdom-extraction'));
        return {
          summary: 'Extracted the open shadow-root content from the Expand Testing practice page.',
          details: extraction.data,
        };
      },
      { url: 'https://practice.expandtesting.com/shadowdom' }
    );

    return finalizeScenario(sessionRun);
  },
};
