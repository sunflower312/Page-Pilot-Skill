import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyWebTableSearchScript = `
  const bodyText = document.body.textContent.replace(/\\s+/g, ' ').trim();
  if (!bodyText.includes('Cierra') || !bodyText.includes('cierra@example.com')) {
    throw new Error('Filtered web table does not include the expected Cierra Vega row.');
  }
  const absentRows = ['Alden', 'Kierra'];
  for (const name of absentRows) {
    if (bodyText.includes(name)) {
      throw new Error(\`Web table search did not filter out \${name}.\`);
    }
  }
  return {
    bodyText: bodyText.slice(0, 240),
    filteredName: 'Cierra',
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the DemoQA web tables page', 'brief');
        await validatePlaywright(context, sessionId, 'Search the web table for Cierra', [
          { type: 'fill', locator: { strategy: 'css', value: '#searchBox' }, value: 'Cierra' },
        ]);
        const verification = await runProbe(
          context,
          sessionId,
          'Verify the filtered web table rows',
          verifyWebTableSearchScript,
          (data) => ({
            filteredName: data.filteredName,
            preview: data.bodyText,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'demoqa-webtables-search'));
        return {
          summary: 'Filtered the DemoQA web table and verified the expected employee row.',
          details: verification.data,
        };
      },
      { url: 'https://demoqa.com/webtables' }
    );

    return finalizeScenario(sessionRun);
  },
};
