import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyTextBoxOutputScript = `
  const output = {
    name: document.querySelector('#name')?.textContent?.trim() ?? '',
    email: document.querySelector('#email')?.textContent?.trim() ?? '',
    currentAddress: document.querySelector('p#currentAddress')?.textContent?.trim() ?? '',
    permanentAddress: document.querySelector('p#permanentAddress')?.textContent?.trim() ?? '',
  };
  if (!output.name.includes('Jane Benchmark')) {
    throw new Error('Submitted name is missing from the output panel.');
  }
  if (!output.email.includes('jane.benchmark@example.com')) {
    throw new Error('Submitted email is missing from the output panel.');
  }
  if (!output.currentAddress.includes('123 Test Street')) {
    throw new Error('Submitted current address is missing from the output panel.');
  }
  if (!output.permanentAddress.includes('456 Permanent Avenue')) {
    throw new Error('Submitted permanent address is missing from the output panel.');
  }
  return output;
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the DemoQA text-box page', 'brief');
        await runActions(context, sessionId, 'Fill and submit the text-box form', [
          { type: 'fill', locator: { strategy: 'css', value: '#userName' }, value: 'Jane Benchmark' },
          {
            type: 'fill',
            locator: { strategy: 'css', value: '#userEmail' },
            value: 'jane.benchmark@example.com',
          },
          {
            type: 'fill',
            locator: { strategy: 'css', value: '#currentAddress' },
            value: '123 Test Street, Testville',
          },
          {
            type: 'fill',
            locator: { strategy: 'css', value: '#permanentAddress' },
            value: '456 Permanent Avenue, Testville',
          },
          { type: 'click', locator: { strategy: 'css', value: '#submit' } },
        ]);
        const verification = await executeScript(
          context,
          sessionId,
          'Verify the submitted text-box output',
          verifyTextBoxOutputScript,
          (data) => ({
            name: data.name,
            email: data.email,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'demoqa-text-box-submit'));
        return {
          summary: 'Submitted the DemoQA text-box form and verified the output panel.',
          details: verification.data,
        };
      },
      { url: 'https://demoqa.com/text-box' }
    );

    return finalizeScenario(sessionRun);
  },
};
