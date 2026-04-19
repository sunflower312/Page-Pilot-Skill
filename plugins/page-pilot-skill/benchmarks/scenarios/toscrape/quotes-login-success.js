import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyLoginScript = `
  const logoutLink = document.querySelector('a[href="/logout"]');
  const quotes = [...document.querySelectorAll('.quote')].slice(0, 5).map((quote) => ({
    text: quote.querySelector('.text')?.textContent?.trim() ?? '',
    author: quote.querySelector('.author')?.textContent?.trim() ?? '',
  }));
  if (!logoutLink) {
    throw new Error('Logout link is missing after login.');
  }
  if (quotes.length === 0 || quotes.some((quote) => !quote.text || !quote.author)) {
    throw new Error('Quotes did not render after login.');
  }
  return {
    url: location.href,
    quoteCount: document.querySelectorAll('.quote').length,
    firstQuote: quotes[0],
    hasLogout: true,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the quotes login page', 'brief');
        await runActions(context, sessionId, 'Authenticate with the demo quotes account', [
          { type: 'fill', locator: { strategy: 'css', value: '#username' }, value: 'admin' },
          { type: 'fill', locator: { strategy: 'css', value: '#password' }, value: 'admin' },
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Login' } } },
        ]);
        const verification = await executeScript(
          context,
          sessionId,
          'Verify the authenticated quotes homepage state',
          verifyLoginScript,
          (data) => ({
            url: data.url,
            quoteCount: data.quoteCount,
            firstQuoteAuthor: data.firstQuote?.author ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'toscrape-quotes-login-success'));
        return {
          summary: 'Logged into Quotes to Scrape and verified the authenticated homepage state.',
          details: verification.data,
        };
      },
      { url: 'https://quotes.toscrape.com/login' }
    );

    return finalizeScenario(sessionRun);
  },
};
