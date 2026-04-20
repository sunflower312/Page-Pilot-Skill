import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifySuccessStateScript = `
  const successNode = document.querySelector('[data-testid="form-success-msg"]');
  const submittedName = document.querySelector('[data-testid="submitted-name"]')?.textContent?.trim() ?? '';
  const successText = successNode?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
  if (!successText.includes('Form Submitted Successfully!')) {
    throw new Error('The practice form did not reach the success state.');
  }
  if (!submittedName.includes('John Doe')) {
    throw new Error('The submitted name is missing from the success state.');
  }
  return {
    successText,
    submittedName,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(context, async ({ sessionId, addArtifact }) => {
      await scanPage(context, sessionId, 'Scan the practice form page', 'brief');
      await validatePlaywright(context, sessionId, 'Fill and submit the practice form', [
        { type: 'fill', locator: { strategy: 'testId', value: 'input-first-name' }, value: 'John' },
        { type: 'fill', locator: { strategy: 'testId', value: 'input-last-name' }, value: 'Doe' },
        { type: 'fill', locator: { strategy: 'testId', value: 'input-email' }, value: 'john@example.com' },
        { type: 'fill', locator: { strategy: 'testId', value: 'input-phone' }, value: '9876543210' },
        { type: 'fill', locator: { strategy: 'css', value: '#dob' }, value: '1995-06-15' },
        { type: 'check', locator: { strategy: 'testId', value: 'radio-gender-male' } },
        { type: 'click', locator: { strategy: 'testId', value: 'select-country' } },
        { type: 'click', locator: { strategy: 'role', value: { role: 'option', name: 'India' } } },
        { type: 'fill', locator: { strategy: 'testId', value: 'input-city' }, value: 'Mumbai' },
        { type: 'fill', locator: { strategy: 'testId', value: 'textarea-bio' }, value: 'Benchmark submission' },
        { type: 'check', locator: { strategy: 'testId', value: 'checkbox-interest-selenium' } },
        { type: 'fill', locator: { strategy: 'css', value: '#password' }, value: 'secret123' },
        { type: 'fill', locator: { strategy: 'testId', value: 'input-confirm-password' }, value: 'secret123' },
        { type: 'check', locator: { strategy: 'testId', value: 'checkbox-terms' } },
        { type: 'click', locator: { strategy: 'testId', value: 'submit-form-btn' } },
      ]);
      const verification = await runProbe(
        context,
        sessionId,
        'Verify the success banner and submitted name',
        verifySuccessStateScript,
        (data) => ({
          successText: data.successText,
          submittedName: data.submittedName,
        })
      );
      addArtifact(await captureScreenshot(context, sessionId, 'qa-playground-form-success'));
      return {
        summary: 'Submitted the practice form and verified the success state.',
        details: verification.data,
      };
    });

    return finalizeScenario(sessionRun);
  },
};
