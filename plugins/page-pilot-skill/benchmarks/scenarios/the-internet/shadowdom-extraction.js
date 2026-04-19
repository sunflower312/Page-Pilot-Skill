import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractShadowTextScript = `
  const hosts = [...document.querySelectorAll('*')]
    .filter((element) => element.shadowRoot)
    .map((element) => ({
      tag: element.tagName,
      text: element.shadowRoot.textContent.replace(/\\s+/g, ' ').trim(),
    }));
  if (hosts.length === 0) {
    throw new Error('No open shadow roots were found on the page.');
  }
  if (hosts.some((host) => !host.text.includes('My default text'))) {
    throw new Error('Shadow root extraction did not recover the expected text.');
  }
  return {
    hostCount: hosts.length,
    hosts,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the shadow DOM example page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract text from the open shadow roots',
          extractShadowTextScript,
          (data) => ({
            hostCount: data.hostCount,
            firstHost: data.hosts[0]?.tag ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'the-internet-shadowdom'));
        return {
          summary: `Extracted text from ${extraction.data.hostCount} open shadow-root hosts.`,
          details: extraction.data,
        };
      },
      { url: 'https://the-internet.herokuapp.com/shadowdom' }
    );

    return finalizeScenario(sessionRun);
  },
};
