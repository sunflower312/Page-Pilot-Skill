import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const readCatalogCountScript = `
  const count = document.querySelectorAll('.thumbnail').length;
  if (count < 6) {
    throw new Error(\`Expected at least six initial cards before load-more, got \${count}.\`);
  }
  return { count };
`;

function buildMeasureLoadMoreScript(initialCount) {
  return `
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const currentCount = document.querySelectorAll('.thumbnail').length;
    if (currentCount > ${initialCount}) {
      return {
        initialCount: ${initialCount},
        finalCount: currentCount,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Catalog count did not increase after clicking More.');
`;
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the load-more catalogue page', 'brief');
        const before = await runProbe(
          context,
          sessionId,
          'Measure the initial catalog size before clicking More',
          readCatalogCountScript,
          (data) => ({ count: data.count })
        );
        await validatePlaywright(context, sessionId, 'Click the More link to reveal additional products', [
          { type: 'click', locator: { strategy: 'css', value: '.ecomerce-items-scroll-more' } },
        ]);
        const measurement = await runProbe(
          context,
          sessionId,
          'Verify that the visible catalog grew after clicking More',
          buildMeasureLoadMoreScript(before.data.count),
          (data) => ({
            initialCount: data.initialCount,
            finalCount: data.finalCount,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'web-scraper-load-more'));
        return {
          summary: `Load-more catalog grew from ${measurement.data.initialCount} to ${measurement.data.finalCount} cards.`,
          details: measurement.data,
        };
      },
      { url: 'https://webscraper.io/test-sites/e-commerce/more/computers/laptops' }
    );

    return finalizeScenario(sessionRun);
  },
};
