import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyRadioCheckboxStatesScript = `
  const foo = document.querySelector('#radio-foo');
  const bar = document.querySelector('#radio-bar');
  const remember = document.querySelector('#checkbox-remember-me');
  const terms = document.querySelector('#checkbox-terms');
  if (!foo || !bar || !remember || !terms) {
    throw new Error('The expected QA Playground controls are missing.');
  }
  if (!foo.checked) {
    throw new Error('Foo radio should be selected.');
  }
  if (bar.checked) {
    throw new Error('Bar radio should remain deselected when Foo is selected.');
  }
  if (remember.getAttribute('aria-checked') !== 'false') {
    throw new Error('Remember me checkbox should be toggled off.');
  }
  if (terms.getAttribute('aria-checked') !== 'true') {
    throw new Error('Terms checkbox should be toggled on.');
  }
  return {
    fooChecked: foo.checked,
    barChecked: bar.checked,
    rememberChecked: remember.getAttribute('aria-checked'),
    termsChecked: terms.getAttribute('aria-checked'),
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the radio and checkbox page', 'brief');
        await validatePlaywright(context, sessionId, 'Toggle the radio and checkbox controls', [
          { type: 'check', locator: { strategy: 'css', value: '#radio-foo' } },
          { type: 'click', locator: { strategy: 'testId', value: 'checkbox-remember-me' } },
          { type: 'click', locator: { strategy: 'testId', value: 'checkbox-terms' } },
        ]);
        const verification = await runProbe(
          context,
          sessionId,
          'Verify the selected radio and toggled checkbox states',
          verifyRadioCheckboxStatesScript,
          (data) => data
        );
        addArtifact(await captureScreenshot(context, sessionId, 'qa-playground-radio-checkbox-states'));
        return {
          summary: 'Selected the Foo radio option and verified the checkbox state changes.',
          details: verification.data,
        };
      },
      { url: 'https://www.qaplayground.com/practice/radio-checkbox' }
    );

    return finalizeScenario(sessionRun);
  },
};
