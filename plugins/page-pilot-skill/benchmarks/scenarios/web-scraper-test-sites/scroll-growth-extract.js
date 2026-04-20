import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const measureScrollGrowthScript = `
  const initialCount = document.querySelectorAll('.thumbnail').length;
  if (initialCount < 3) {
    throw new Error(\`Expected at least three initial cards before scrolling, got \${initialCount}.\`);
  }
  window.scrollTo(0, document.body.scrollHeight);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const currentCount = document.querySelectorAll('.thumbnail').length;
    if (currentCount > initialCount) {
      return {
        initialCount,
        finalCount: currentCount,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Catalog count did not increase after scrolling.');
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the infinite-scroll catalogue page', 'brief');
        const measurement = await runProbe(
          context,
          sessionId,
          'Scroll the page and verify product growth',
          measureScrollGrowthScript,
          (data) => ({
            initialCount: data.initialCount,
            finalCount: data.finalCount,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'web-scraper-scroll-growth'));
        return {
          summary: `Infinite-scroll catalog grew from ${measurement.data.initialCount} to ${measurement.data.finalCount} cards.`,
          details: measurement.data,
        };
      },
      { url: 'https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops' }
    );

    return finalizeScenario(sessionRun);
  },
};
