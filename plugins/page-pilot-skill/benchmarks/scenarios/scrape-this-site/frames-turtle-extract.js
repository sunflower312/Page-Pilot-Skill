import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractFrameScript = `
  const expectedFamilies = ['Carettochelyidae', 'Cheloniidae', 'Chelydridae', 'Dermatemydidae', 'Dermochelyidae'];
  const frame = document.querySelector('iframe');
  const frameDocument = frame?.contentDocument;
  if (!frame) {
    throw new Error('The expected iframe is missing.');
  }
  if (!frameDocument) {
    throw new Error('The iframe document did not load.');
  }
  const headings = [...frameDocument.querySelectorAll('h1, h2, h3, h4')]
    .map((node) => node.textContent.trim())
    .filter(Boolean);
  const turtleHeadings = headings.filter((heading) => expectedFamilies.includes(heading));
  if (turtleHeadings.length < 3) {
    throw new Error('No turtle headings were found inside the frame document.');
  }
  return {
    frameSrc: frame.getAttribute('src'),
    headingCount: turtleHeadings.length,
    headings: turtleHeadings.slice(0, 10),
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the frames sandbox', 'brief');
        const extraction = await runProbe(
          context,
          sessionId,
          'Extract turtle headings from the iframe document',
          extractFrameScript,
          (data) => ({
            frameSrc: data.frameSrc,
            headingCount: data.headingCount,
            firstHeading: data.headings[0] ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'scrape-this-site-frames'));
        return {
          summary: `Extracted ${extraction.data.headingCount} turtle headings from the iframe sandbox.`,
          details: extraction.data,
        };
      },
      { url: 'https://www.scrapethissite.com/pages/frames/' }
    );

    return finalizeScenario(sessionRun);
  },
};
