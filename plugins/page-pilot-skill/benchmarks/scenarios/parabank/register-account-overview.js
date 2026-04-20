import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

function registrationActions(username) {
  return [
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.firstName' }, value: 'Bench' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.lastName' }, value: 'User' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.street' }, value: '1 Test Street' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.city' }, value: 'Testville' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.state' }, value: 'CA' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.zipCode' }, value: '90001' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.phoneNumber' }, value: '5551234567' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.ssn' }, value: '123456789' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.username' }, value: username },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.password' }, value: 'secret123' },
    { type: 'fill', locator: { strategy: 'css', value: '#repeatedPassword' }, value: 'secret123' },
    { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Register' } } },
    { type: 'assert_text', locator: { strategy: 'css', value: '#leftPanel' }, value: 'Open New Account' },
  ];
}

const verifyRegistrationScript = `
  const bodyText = document.body.textContent.replace(/\\s+/g, ' ').trim();
  const accountLinks = [...document.querySelectorAll('#leftPanel a')].map((link) => link.textContent.trim()).filter(Boolean);
  if (!bodyText.includes('Welcome Bench User')) {
    throw new Error('The ParaBank welcome text is missing after registration.');
  }
  if (!accountLinks.includes('Accounts Overview')) {
    throw new Error('Accounts Overview link is missing after registration.');
  }
  return {
    title: document.title,
    accountLinks,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the ParaBank registration page', 'brief');
        await validatePlaywright(
          context,
          sessionId,
          'Register a new ParaBank demo customer',
          registrationActions('{{pagePilot.uniqueUsername:parabank-register}}')
        );
        const verification = await runProbe(
          context,
          sessionId,
          'Verify the post-registration account overview links',
          verifyRegistrationScript,
          (data) => ({
            title: data.title,
            accountLinks: data.accountLinks.slice(0, 4),
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'parabank-register-success'));
        return {
          summary: 'Registered a ParaBank demo customer and verified the account services menu.',
          details: {
            ...verification.data,
          },
        };
      },
      { url: 'https://parabank.parasoft.com/parabank/register.htm' }
    );

    return finalizeScenario(sessionRun);
  },
};
