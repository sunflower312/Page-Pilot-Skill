import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractPagedTableScript = `
  const headers = [...document.querySelectorAll('table th')].map((cell) => cell.textContent.trim());
  const rows = [...document.querySelectorAll('table tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
  );
  if (!location.search.includes('pageno=2')) {
    throw new Error('The pagination flow did not reach page 2.');
  }
  if (rows.length === 0) {
    throw new Error('The paginated table is empty on page 2.');
  }
  return {
    page: location.search,
    headers,
    rowCount: rows.length,
    firstRow: rows[0],
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the pagination challenge page', 'brief');
        await runActions(context, sessionId, 'Switch to the second pagination page', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: '2' } } },
          { type: 'assert_url', value: 'pageno=2' },
        ]);
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract the second-page table rows',
          extractPagedTableScript,
          (data) => ({
            page: data.page,
            rowCount: data.rowCount,
            firstName: data.firstRow?.[0] ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'tryscrapeme-pagination-page-2'));
        return {
          summary: `Reached page 2 and extracted ${extraction.data.rowCount} paginated rows.`,
          details: extraction.data,
        };
      },
      { url: 'https://tryscrapeme.com/web-scraping-practice/beginner/pagination' }
    );

    return finalizeScenario(sessionRun);
  },
};
