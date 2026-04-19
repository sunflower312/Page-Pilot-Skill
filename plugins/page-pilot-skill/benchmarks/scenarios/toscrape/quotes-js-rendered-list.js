import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractQuotesScript = `
  const quotes = [...document.querySelectorAll('.quote')].slice(0, 5).map((quote) => ({
    text: quote.querySelector('.text')?.textContent?.trim() ?? '',
    author: quote.querySelector('.author')?.textContent?.trim() ?? '',
    tags: [...quote.querySelectorAll('.tag')].map((tag) => tag.textContent.trim()).filter(Boolean),
  }));
  if (quotes.length < 5) {
    throw new Error('Expected at least five rendered quotes on the JavaScript page.');
  }
  if (quotes.some((quote) => !quote.text || !quote.author)) {
    throw new Error('Rendered quotes contain empty text or author fields.');
  }
  return {
    quoteCount: document.querySelectorAll('.quote').length,
    quotes,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the JavaScript-rendered quotes page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract rendered quotes and authors',
          extractQuotesScript,
          (data) => ({
            quoteCount: data.quoteCount,
            firstQuoteAuthor: data.quotes[0]?.author ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'toscrape-js-quotes'));
        return {
          summary: `Extracted ${extraction.data.quotes.length} rendered quotes from the JavaScript sandbox.`,
          details: extraction.data,
        };
      },
      { url: 'https://quotes.toscrape.com/js/' }
    );

    return finalizeScenario(sessionRun);
  },
};
