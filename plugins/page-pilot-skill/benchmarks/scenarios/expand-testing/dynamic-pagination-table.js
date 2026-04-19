import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const readPageSnapshotScript = `
  const info = document.querySelector('#example_info')?.textContent?.trim() ?? '';
  const rows = [...document.querySelectorAll('#example tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
  );
  if (rows.length === 0) {
    throw new Error('The dynamic pagination table does not expose any rows.');
  }
  return {
    info,
    rowCount: rows.length,
    firstRow: rows[0],
  };
`;

function buildVerifyLaterPageScript(firstRow) {
  return `
    const info = document.querySelector('#example_info')?.textContent?.trim() ?? '';
    const rows = [...document.querySelectorAll('#example tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
    );
    if (rows.length === 0) {
      throw new Error('The later table page does not expose any rows.');
    }
    const firstRow = ${JSON.stringify(firstRow)};
    const currentFirstRow = rows[0];
    if (JSON.stringify(currentFirstRow) === JSON.stringify(firstRow)) {
      throw new Error('The table first row did not change after pagination.');
    }
    if (!/Showing 4 to 6 of 10 entries|Showing 7 to 9 of 10 entries|Showing 10 to 10 of 10 entries/.test(info)) {
      throw new Error(\`Unexpected pagination info after moving pages: \${info}\`);
    }
    return {
      info,
      rowCount: rows.length,
      firstRow: currentFirstRow,
    };
  `;
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the dynamic pagination table page', 'brief');
        const before = await executeScript(
          context,
          sessionId,
          'Read the first pagination snapshot',
          readPageSnapshotScript,
          (data) => ({
            info: data.info,
            rowCount: data.rowCount,
            firstStudent: data.firstRow?.[0] ?? null,
          })
        );
        await runActions(context, sessionId, 'Move to the next table page', [
          { type: 'click', locator: { strategy: 'css', value: '#example_next a' } },
        ]);
        const after = await executeScript(
          context,
          sessionId,
          'Verify the next pagination snapshot',
          buildVerifyLaterPageScript(before.data.firstRow),
          (data) => ({
            info: data.info,
            rowCount: data.rowCount,
            firstStudent: data.firstRow?.[0] ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'expand-testing-dynamic-pagination-table'));
        return {
          summary: 'Paginated the dynamic student table and verified the visible row set changed.',
          details: {
            before: before.data,
            after: after.data,
          },
        };
      },
      { url: 'https://practice.expandtesting.com/dynamic-pagination-table' }
    );

    return finalizeScenario(sessionRun);
  },
};
