import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractExpandTestingIframeScript = `
  const frames = [...document.querySelectorAll('iframe')].map((frame, index) => {
    const src = frame.getAttribute('src') || null;
    try {
      const bodyText = frame.contentDocument?.body?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
      return {
        index,
        id: frame.id || null,
        src,
        accessible: true,
        bodyText,
      };
    } catch (error) {
      return {
        index,
        id: frame.id || null,
        src,
        accessible: false,
        bodyText: '',
      };
    }
  });
  const internalFrame = frames.find(
    (frame) =>
      frame.accessible &&
      frame.bodyText &&
      (frame.id === 'mce_0_ifr' || frame.id === 'email-subscribe' || frame.bodyText.includes('Your content goes here.'))
  );
  if (!internalFrame) {
    throw new Error('The Expand Testing iframe page did not expose a readable internal iframe.');
  }
  return {
    frameCount: frames.length,
    internalFrame,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the Expand Testing iframe page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract content from the accessible internal iframe',
          extractExpandTestingIframeScript,
          (data) => ({
            frameCount: data.frameCount,
            iframeId: data.internalFrame?.id ?? null,
            bodyText: data.internalFrame?.bodyText?.slice(0, 80) ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'expand-testing-iframe-content-extract'));
        return {
          summary: 'Ignored cross-origin frames and extracted readable text from an internal Expand Testing iframe.',
          details: extraction.data,
        };
      },
      { url: 'https://practice.expandtesting.com/iframe' }
    );

    return finalizeScenario(sessionRun);
  },
};
