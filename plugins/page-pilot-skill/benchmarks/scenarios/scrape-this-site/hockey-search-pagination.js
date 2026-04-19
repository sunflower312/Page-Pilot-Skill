import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyPageTwoScript = `
  const rows = [...document.querySelectorAll('table tbody tr')].slice(0, 5).map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
  );
  if (!location.search.includes('page_num=2')) {
    throw new Error('Pagination did not reach page_num=2.');
  }
  if (rows.length === 0) {
    throw new Error('No hockey rows were visible after changing to page 2.');
  }
  return {
    page: location.search,
    firstRow: rows[0],
    rowCount: document.querySelectorAll('table tbody tr').length,
  };
`;

const verifySearchScript = `
  const rows = [...document.querySelectorAll('table tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
  ).filter((row) => row.length > 0);
  if (!location.search.includes('q=Toronto')) {
    throw new Error('Search query parameter is missing after filtering.');
  }
  if (rows.length === 0) {
    throw new Error('Toronto search returned no table rows.');
  }
  if (rows.some((row) => !row[0]?.includes('Toronto Maple Leafs'))) {
    throw new Error('Search results include non-Toronto rows.');
  }
  return {
    query: location.search,
    rowCount: rows.length,
    firstRow: rows[0],
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the hockey search and pagination page', 'brief');
        await runActions(context, sessionId, 'Advance to the second pagination page', [
          { type: 'click', locator: { strategy: 'css', value: '.pagination a[href$="page_num=2"]' } },
          { type: 'assert_url', value: 'page_num=2' },
        ]);
        const paged = await executeScript(
          context,
          sessionId,
          'Verify page-two hockey rows',
          verifyPageTwoScript,
          (data) => ({
            page: data.page,
            rowCount: data.rowCount,
            firstTeam: data.firstRow?.[0] ?? null,
          })
        );
        await runActions(context, sessionId, 'Search for Toronto teams', [
          { type: 'fill', locator: { strategy: 'css', value: '#q' }, value: 'Toronto' },
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Search' } } },
          { type: 'assert_url', value: 'q=Toronto' },
        ]);
        const filtered = await executeScript(
          context,
          sessionId,
          'Verify filtered Toronto results',
          verifySearchScript,
          (data) => ({
            query: data.query,
            rowCount: data.rowCount,
            firstTeam: data.firstRow?.[0] ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'scrape-this-site-hockey-search'));
        return {
          summary: 'Verified both pagination and search on the hockey forms sandbox.',
          details: {
            pagination: paged.data,
            search: filtered.data,
          },
        };
      },
      { url: 'https://www.scrapethissite.com/pages/forms/' }
    );

    return finalizeScenario(sessionRun);
  },
};
