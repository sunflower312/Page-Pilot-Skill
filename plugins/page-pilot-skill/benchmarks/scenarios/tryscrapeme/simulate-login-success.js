import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyLoginResultScript = `
  const headers = [...document.querySelectorAll('table th')].map((cell) => cell.textContent.trim());
  const rows = [...document.querySelectorAll('table tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())
  );
  if (rows.length === 0) {
    throw new Error('Simulated login did not reveal the protected table.');
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
        await scanPage(context, sessionId, 'Scan the simulated login page', 'brief');
        await runActions(context, sessionId, 'Submit the simulated login credentials', [
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="username"]' }, value: 'admin' },
          {
            type: 'fill',
            locator: { strategy: 'css', value: 'input[name="password"]' },
            value: 'tryscrapeme.com',
          },
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Login' } } },
        ]);
        const verification = await executeScript(
          context,
          sessionId,
          'Verify that the protected table is visible',
          verifyLoginResultScript,
          (data) => ({
            rowCount: data.rowCount,
            firstName: data.firstRow?.[0] ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'tryscrapeme-simulated-login'));
        return {
          summary: 'Submitted the simulated login form and verified the protected table contents.',
          details: verification.data,
        };
      },
      { url: 'https://tryscrapeme.com/web-scraping-practice/beginner/simulate-login' }
    );

    return finalizeScenario(sessionRun);
  },
};
