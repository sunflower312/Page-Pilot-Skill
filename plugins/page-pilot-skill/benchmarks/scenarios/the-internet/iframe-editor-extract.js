import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractIframeEditorScript = `
  const frames = [...document.querySelectorAll('iframe')].map((frame, index) => {
    try {
      const bodyText = frame.contentDocument?.body?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
      return {
        index,
        id: frame.id || null,
        title: frame.getAttribute('title') || null,
        accessible: true,
        bodyText,
      };
    } catch (error) {
      return {
        index,
        id: frame.id || null,
        title: frame.getAttribute('title') || null,
        accessible: false,
        bodyText: '',
      };
    }
  });
  const editorFrame = frames.find((frame) => frame.accessible && frame.bodyText.includes('Your content goes here.'));
  if (!editorFrame) {
    throw new Error('The TinyMCE iframe did not expose the expected starter text.');
  }
  return {
    frameCount: frames.length,
    editorFrame,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the TinyMCE iframe page', 'brief');
        const extraction = await runProbe(
          context,
          sessionId,
          'Extract the starter text from the iframe editor',
          extractIframeEditorScript,
          (data) => ({
            frameCount: data.frameCount,
            iframeId: data.editorFrame?.id ?? null,
            bodyText: data.editorFrame?.bodyText ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'the-internet-iframe-editor-extract'));
        return {
          summary: 'Resolved the TinyMCE iframe and extracted its initial editor body text.',
          details: extraction.data,
        };
      },
      { url: 'https://the-internet.herokuapp.com/iframe' }
    );

    return finalizeScenario(sessionRun);
  },
};
