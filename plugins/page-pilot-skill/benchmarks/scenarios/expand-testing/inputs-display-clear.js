import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyDisplayedValuesScript = `
  const text = document.body.textContent.replace(/\\s+/g, ' ').trim();
  const required = ['Output: Number', '42', 'Output: Text', 'hello benchmark', 'Output: Password', 'secret123', 'Output: Date', '2026-04-18'];
  for (const fragment of required) {
    if (!text.includes(fragment)) {
      throw new Error(\`Missing displayed output fragment: \${fragment}\`);
    }
  }
  return {
    displayed: required,
  };
`;

const verifyClearedInputsScript = `
  const values = {
    number: document.querySelector('#input-number')?.value ?? null,
    text: document.querySelector('#input-text')?.value ?? null,
    password: document.querySelector('#input-password')?.value ?? null,
    date: document.querySelector('#input-date')?.value ?? null,
  };
  if (values.number || values.text || values.password || values.date) {
    throw new Error(\`Expected inputs to be cleared, got \${JSON.stringify(values)}.\`);
  }
  return values;
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the inputs practice page', 'brief');
        await runActions(context, sessionId, 'Fill the inputs and display their values', [
          { type: 'fill', locator: { strategy: 'css', value: '#input-number' }, value: '42' },
          { type: 'fill', locator: { strategy: 'css', value: '#input-text' }, value: 'hello benchmark' },
          { type: 'fill', locator: { strategy: 'css', value: '#input-password' }, value: 'secret123' },
          { type: 'fill', locator: { strategy: 'css', value: '#input-date' }, value: '2026-04-18' },
          { type: 'click', locator: { strategy: 'css', value: '#btn-display-inputs' } },
        ]);
        const displayed = await executeScript(
          context,
          sessionId,
          'Verify the displayed output values',
          verifyDisplayedValuesScript,
          (data) => ({ displayedCount: data.displayed.length })
        );
        await runActions(context, sessionId, 'Clear the input values', [
          { type: 'click', locator: { strategy: 'css', value: '#btn-clear-inputs' } },
        ]);
        const cleared = await executeScript(
          context,
          sessionId,
          'Verify the fields were cleared',
          verifyClearedInputsScript,
          (data) => data
        );
        addArtifact(await captureScreenshot(context, sessionId, 'expand-testing-inputs-cleared'));
        return {
          summary: 'Displayed and then cleared the Expand Testing input values successfully.',
          details: {
            displayed: displayed.data,
            cleared: cleared.data,
          },
        };
      },
      { url: 'https://practice.expandtesting.com/inputs' }
    );

    return finalizeScenario(sessionRun);
  },
};
