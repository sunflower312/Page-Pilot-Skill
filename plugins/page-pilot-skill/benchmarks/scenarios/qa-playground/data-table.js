import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractDataTableScript = `
  const headers = [...document.querySelectorAll('table thead th')].map((cell) => cell.textContent.trim());
  const rows = [...document.querySelectorAll('table tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
  );
  if (headers.length < 6) {
    throw new Error('The data table headers are incomplete.');
  }
  if (rows.length < 5) {
    throw new Error(\`Expected at least five data rows, got \${rows.length}.\`);
  }
  return {
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
        await scanPage(context, sessionId, 'Scan the data-table practice page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract the practice data table',
          extractDataTableScript,
          (data) => ({
            headerCount: data.headers.length,
            rowCount: data.rowCount,
            firstBook: data.firstRow?.[1] ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'qa-playground-data-table'));
        return {
          summary: `Extracted ${extraction.data.rowCount} rows from the QA Playground data table.`,
          details: extraction.data,
        };
      },
      { url: 'https://www.qaplayground.com/practice/data-table' }
    );

    return finalizeScenario(sessionRun);
  },
};
