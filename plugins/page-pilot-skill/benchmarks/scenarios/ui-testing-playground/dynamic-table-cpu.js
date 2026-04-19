import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractDynamicTableCpuScript = `
  const warningText = document.querySelector('.bg-warning')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
  const rows = [...document.querySelectorAll('[role="table"] [role="row"]')].map((row) =>
    [...row.querySelectorAll('[role="cell"], [role="columnheader"]')].map((cell) => cell.textContent.trim())
  );
  if (rows.length < 2) {
    throw new Error('The dynamic table did not expose a header row and data rows.');
  }
  const headers = rows[0];
  const cpuColumnIndex = headers.findIndex((header) => header === 'CPU');
  if (cpuColumnIndex === -1) {
    throw new Error('The dynamic table did not expose a CPU column.');
  }
  const processRows = rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null]))
  );
  const chromeRow = processRows.find((row) => row.Name === 'Chrome');
  if (!chromeRow) {
    throw new Error('The Chrome row was not found in the dynamic table.');
  }
  const labelMatch = warningText.match(/^Chrome CPU:\\s*(.+)$/);
  if (!labelMatch) {
    throw new Error(\`The Chrome CPU label was missing or malformed: "\${warningText}".\`);
  }
  const labelCpu = labelMatch[1];
  if (chromeRow.CPU !== labelCpu) {
    throw new Error(\`Chrome CPU mismatch: label=\${labelCpu}, table=\${chromeRow.CPU}.\`);
  }
  return {
    warningText,
    headers,
    cpuColumnIndex,
    rowCount: processRows.length,
    chromeRow,
    labelCpu,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the dynamic table page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract the Chrome CPU value from the dynamic table',
          extractDynamicTableCpuScript,
          (data) => ({
            labelCpu: data.labelCpu,
            cpuColumnIndex: data.cpuColumnIndex,
            rowCount: data.rowCount,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'ui-testing-playground-dynamic-table-cpu'));
        return {
          summary: 'Matched the Chrome CPU warning label against the Chrome row in the dynamic table.',
          details: extraction.data,
        };
      },
      { url: 'http://uitestingplayground.com/dynamictable' }
    );

    return finalizeScenario(sessionRun);
  },
};
