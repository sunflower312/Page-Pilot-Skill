import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractAjaxCatalogScript = `
  const cards = [...document.querySelectorAll('.thumbnail')].map((card) => ({
    title: card.querySelector('.title')?.textContent?.trim() ?? '',
    price: card.querySelector('.price')?.textContent?.trim() ?? '',
    reviews: card.querySelector('.ratings p.pull-right')?.textContent?.trim() ?? '',
  }));
  if (cards.length < 6) {
    throw new Error(\`Expected at least six AJAX product cards, got \${cards.length}.\`);
  }
  if (cards.slice(0, 6).some((card) => !card.title || !card.price)) {
    throw new Error('AJAX catalog extraction returned empty titles or prices.');
  }
  return {
    count: cards.length,
    sample: cards.slice(0, 6),
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the AJAX catalogue page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract AJAX-loaded laptop cards',
          extractAjaxCatalogScript,
          (data) => ({
            count: data.count,
            firstTitle: data.sample[0]?.title ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'web-scraper-ajax-catalog'));
        return {
          summary: `Extracted ${extraction.data.count} AJAX laptop cards from the catalog sandbox.`,
          details: extraction.data,
        };
      },
      { url: 'https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops' }
    );

    return finalizeScenario(sessionRun);
  },
};
