import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractBooksScript = `
  const books = [...document.querySelectorAll('.product_pod h3 a')].slice(0, 5).map((link) => ({
    title: link.getAttribute('title'),
    href: link.href,
  }));
  const count = document.querySelectorAll('.product_pod').length;
  if (count !== 20) {
    throw new Error('Expected 20 book cards on the paginated catalogue page.');
  }
  if (books.length === 0 || books.some((book) => !book.title)) {
    throw new Error('Book extraction returned empty titles.');
  }
  return {
    page: location.pathname,
    count,
    books,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(context, async ({ sessionId, addArtifact }) => {
      await scanPage(context, sessionId, 'Scan the catalogue landing page', 'brief');
      await runActions(context, sessionId, 'Advance to the second catalogue page', [
        { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'next' } } },
        { type: 'assert_url', value: 'page-2.html' },
      ]);
      const extraction = await executeScript(
        context,
        sessionId,
        'Extract book metadata from the second page',
        extractBooksScript,
        (data) => ({
          page: data.page,
          count: data.count,
          firstTitle: data.books[0]?.title ?? null,
        })
      );
      addArtifact(await captureScreenshot(context, sessionId, 'toscrape-catalogue-page-2'));
      return {
        summary: `Extracted ${extraction.data.count} book cards from ${extraction.data.page}.`,
        details: extraction.data,
      };
    });

    return finalizeScenario(sessionRun);
  },
};
