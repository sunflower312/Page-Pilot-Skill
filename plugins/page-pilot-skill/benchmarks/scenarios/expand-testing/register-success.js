import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifyRegistrationScript = `
  const flash = document.querySelector('#flash')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
  if (!location.pathname.endsWith('/login')) {
    throw new Error(\`Expected to land on /login after registration, got \${location.pathname}.\`);
  }
  if (!flash.includes('Successfully registered, you can log in now.')) {
    throw new Error('Registration success flash is missing.');
  }
  return {
    flash,
    url: location.href,
  };
`;

export const scenario = {
  async run(context) {
    const username = `bench${Date.now()}`;
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the register page', 'brief');
        await runActions(context, sessionId, 'Register a fresh practice account', [
          { type: 'fill', locator: { strategy: 'css', value: '#username' }, value: username },
          { type: 'fill', locator: { strategy: 'css', value: '#password' }, value: 'secret12345' },
          { type: 'fill', locator: { strategy: 'css', value: '#confirmPassword' }, value: 'secret12345' },
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Register' } } },
        ]);
        const verification = await executeScript(
          context,
          sessionId,
          'Verify the registration success state',
          verifyRegistrationScript,
          (data) => ({
            url: data.url,
            flash: data.flash,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'expand-testing-register-success'));
        return {
          summary: `Registered the practice account ${username} and verified the login-ready success state.`,
          details: {
            username,
            ...verification.data,
          },
        };
      },
      { url: 'https://practice.expandtesting.com/register' }
    );

    return finalizeScenario(sessionRun);
  },
};
