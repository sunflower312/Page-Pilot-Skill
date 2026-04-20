import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractDemoQaFramesScript = `
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const frames = [...document.querySelectorAll('iframe')].map((frame, index) => {
      try {
        const bodyText = frame.contentDocument?.body?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
        return {
          index,
          id: frame.id || null,
          src: frame.getAttribute('src') || null,
          accessible: true,
          bodyText,
        };
      } catch (error) {
        return {
          index,
          id: frame.id || null,
          src: frame.getAttribute('src') || null,
          accessible: false,
          bodyText: '',
        };
      }
    });
    const accessibleFrames = frames.filter((frame) => frame.accessible && frame.bodyText);
    const sampleFrame = accessibleFrames.find((frame) => frame.bodyText.includes('This is a sample page'));
    if (frames.length >= 2 && sampleFrame) {
      return {
        frameCount: frames.length,
        accessibleFrameCount: accessibleFrames.length,
        sampleFrame,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('No accessible DemoQA iframe exposed the sample page text.');
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the DemoQA frames page', 'brief');
        const extraction = await runProbe(
          context,
          sessionId,
          'Extract the sample text from the accessible DemoQA frames',
          extractDemoQaFramesScript,
          (data) => ({
            frameCount: data.frameCount,
            accessibleFrameCount: data.accessibleFrameCount,
            sampleFrameId: data.sampleFrame?.id ?? null,
            sampleText: data.sampleFrame?.bodyText ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'demoqa-frames-sample-extract'));
        return {
          summary: 'Confirmed the DemoQA frames page exposes two readable sample iframes and extracted their text.',
          details: extraction.data,
        };
      },
      { url: 'https://demoqa.com/frames' }
    );

    return finalizeScenario(sessionRun);
  },
};
