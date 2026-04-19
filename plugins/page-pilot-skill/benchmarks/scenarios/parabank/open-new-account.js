import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

function registrationActions(username) {
  return [
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.firstName' }, value: 'Bench' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.lastName' }, value: 'User' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.street' }, value: '2 State Flow Road' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.city' }, value: 'Testville' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.state' }, value: 'CA' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.zipCode' }, value: '90001' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.phoneNumber' }, value: '5557654321' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.ssn' }, value: '987654321' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.username' }, value: username },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.password' }, value: 'secret123' },
    { type: 'fill', locator: { strategy: 'css', value: '#repeatedPassword' }, value: 'secret123' },
    { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Register' } } },
  ];
}

const verifyNewAccountScript = `
  const bodyText = document.body.textContent.replace(/\\s+/g, ' ').trim();
  const accountLink = document.querySelector('#newAccountId');
  if (!bodyText.includes('Account Opened!')) {
    throw new Error('Open New Account did not reach the success state.');
  }
  if (!accountLink) {
    throw new Error('New account link is missing from the success state.');
  }
  return {
    title: document.title,
    accountId: accountLink.textContent.trim(),
    bodyText: bodyText.slice(0, 240),
  };
`;

export const scenario = {
  async run(context) {
    const username = `bench${Date.now()}a`;
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the ParaBank registration page for the open-account flow', 'brief');
        await runActions(context, sessionId, 'Register a new ParaBank customer for the open-account flow', registrationActions(username));
        await runActions(context, sessionId, 'Open a new account from the account services menu', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Open New Account' } } },
          { type: 'click', locator: { strategy: 'css', value: 'input[value="Open New Account"]' } },
        ]);
        const verification = await executeScript(
          context,
          sessionId,
          'Verify the open-account success state',
          verifyNewAccountScript,
          (data) => ({
            title: data.title,
            accountId: data.accountId,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'parabank-open-new-account'));
        return {
          summary: 'Registered a ParaBank demo customer and opened a new account successfully.',
          details: {
            username,
            ...verification.data,
          },
        };
      },
      { url: 'https://parabank.parasoft.com/parabank/register.htm' }
    );

    return finalizeScenario(sessionRun);
  },
};
