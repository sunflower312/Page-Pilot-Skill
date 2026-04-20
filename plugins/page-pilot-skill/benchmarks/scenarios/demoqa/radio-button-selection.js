import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyRadioSelectionScript = `
  const yesRadio = document.querySelector('#yesRadio');
  const noRadio = document.querySelector('#noRadio');
  const resultText = document.querySelector('.text-success')?.textContent?.trim() ?? '';
  if (!yesRadio) {
    throw new Error('Yes radio input is missing from the page.');
  }
  if (!noRadio) {
    throw new Error('No radio input is missing from the page.');
  }
  if (!yesRadio.checked) {
    throw new Error('Yes radio should be checked after selection.');
  }
  if (resultText !== 'Yes') {
    throw new Error(\`Expected radio result text to be "Yes", received "\${resultText}".\`);
  }
  if (!noRadio.disabled) {
    throw new Error('No radio should remain disabled on the DemoQA radio page.');
  }
  return {
    yesChecked: yesRadio.checked,
    noDisabled: noRadio.disabled,
    resultText,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the DemoQA radio-button page', 'brief');
        await validatePlaywright(context, sessionId, 'Select the Yes radio option', [
          { type: 'click', locator: { strategy: 'css', value: 'label[for="yesRadio"]' } },
        ]);
        const verification = await runProbe(
          context,
          sessionId,
          'Verify the selected radio result and disabled state',
          verifyRadioSelectionScript,
          (data) => ({
            resultText: data.resultText,
            noDisabled: data.noDisabled,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'demoqa-radio-button-selection'));
        return {
          summary: 'Selected the DemoQA radio button and verified the result state.',
          details: verification.data,
        };
      },
      { url: 'https://demoqa.com/radio-button' }
    );

    return finalizeScenario(sessionRun);
  },
};
