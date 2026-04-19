import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractCatalogScript = `
  if (!location.pathname.includes('/computers')) {
    throw new Error('Unexpected category path for the static catalogue benchmark.');
  }
  const cards = [...document.querySelectorAll('.thumbnail')].map((card) => ({
    title: card.querySelector('.title')?.textContent?.trim(),
    price: card.querySelector('.price')?.textContent?.trim(),
    reviews: card.querySelector('.review-count')?.textContent?.replace(/\\s+/g, ' ').trim(),
  }));
  if (cards.length === 0) {
    throw new Error('No product cards were found on the static catalogue page.');
  }
  const sample = cards.slice(0, 5);
  const pricePattern = /^\\$\\d+(?:\\.\\d{1,2})?$/;
  const reviewsPattern = /^\\d+\\s+reviews?$/i;
  for (const [index, card] of sample.entries()) {
    if (!card.title) {
      throw new Error(\`Sample card #\${index + 1} is missing a title.\`);
    }
    if (!card.price || !pricePattern.test(card.price)) {
      throw new Error(\`Sample card #\${index + 1} has an invalid price: \${card.price ?? 'missing'}.\`);
    }
    if (!card.reviews || !reviewsPattern.test(card.reviews)) {
      throw new Error(\`Sample card #\${index + 1} has an invalid reviews label: \${card.reviews ?? 'missing'}.\`);
    }
  }
  return {
    path: location.pathname,
    count: cards.length,
    cards: sample,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(context, async ({ sessionId, addArtifact }) => {
      await scanPage(context, sessionId, 'Scan the static catalogue page', 'brief');
      const extraction = await executeScript(
        context,
        sessionId,
        'Extract catalogue cards from the computers page',
        extractCatalogScript,
        (data) => ({
          path: data.path,
          count: data.count,
          firstTitle: data.cards[0]?.title ?? null,
        })
      );
      addArtifact(await captureScreenshot(context, sessionId, 'web-scraper-static-catalogue'));
      return {
        summary: `Extracted ${extraction.data.count} product cards from ${extraction.data.path}.`,
        details: extraction.data,
      };
    });

    return finalizeScenario(sessionRun);
  },
};
