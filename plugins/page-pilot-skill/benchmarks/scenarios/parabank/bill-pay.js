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
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.street' }, value: '9 Billing Street' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.city' }, value: 'Testville' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.state' }, value: 'CA' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.zipCode' }, value: '90001' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.phoneNumber' }, value: '5550001234' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.ssn' }, value: '111223333' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.username' }, value: username },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.password' }, value: 'secret123' },
    { type: 'fill', locator: { strategy: 'css', value: '#repeatedPassword' }, value: 'secret123' },
    { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Register' } } },
  ];
}

const verifyBillPayPageScript = `
  const accountOptions = [...document.querySelectorAll('select[name="fromAccountId"] option')].map((option) => ({
    value: option.value,
    text: option.textContent.trim(),
  }));
  if (accountOptions.length === 0) {
    throw new Error('Bill Pay page did not expose any source accounts for payment.');
  }
  return {
    accountOptions,
  };
`;

const verifyBillPayResultScript = `
  const bodyText = document.body.textContent.replace(/\\s+/g, ' ').trim();
  if (!/Bill Payment Complete/i.test(bodyText)) {
    throw new Error('Bill Payment Complete confirmation is missing.');
  }
  return {
    bodyText: bodyText.slice(0, 240),
  };
`;

export const scenario = {
  async run(context) {
    const username = `bench${Date.now()}b`;
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the ParaBank registration page for the bill-pay flow', 'brief');
        await runActions(context, sessionId, 'Register a new ParaBank customer for the bill-pay flow', registrationActions(username));
        await runActions(context, sessionId, 'Open the Bill Pay page', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Bill Pay' } } },
        ]);
        const readiness = await executeScript(
          context,
          sessionId,
          'Verify that the Bill Pay page has source account options',
          verifyBillPayPageScript,
          (data) => ({ accountOptionCount: data.accountOptions.length })
        );
        const firstAccountId = readiness.data.accountOptions[0].value;
        await runActions(context, sessionId, 'Submit a bill payment', [
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="payee.name"]' }, value: 'Utility Company' },
          {
            type: 'fill',
            locator: { strategy: 'css', value: 'input[name="payee.address.street"]' },
            value: '9 Market Street',
          },
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="payee.address.city"]' }, value: 'Testville' },
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="payee.address.state"]' }, value: 'CA' },
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="payee.address.zipCode"]' }, value: '90001' },
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="payee.phoneNumber"]' }, value: '5551234567' },
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="payee.accountNumber"]' }, value: '123456789' },
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="verifyAccount"]' }, value: '123456789' },
          { type: 'fill', locator: { strategy: 'css', value: 'input[name="amount"]' }, value: '25' },
          { type: 'select', locator: { strategy: 'css', value: 'select[name="fromAccountId"]' }, value: firstAccountId },
          { type: 'click', locator: { strategy: 'css', value: 'input[value="Send Payment"]' } },
        ]);
        const verification = await executeScript(
          context,
          sessionId,
          'Verify the Bill Payment confirmation',
          verifyBillPayResultScript,
          (data) => data
        );
        addArtifact(await captureScreenshot(context, sessionId, 'parabank-bill-pay'));
        return {
          summary: 'Registered a ParaBank demo customer and completed a bill payment.',
          details: {
            username,
            accountOptionCount: readiness.data.accountOptions.length,
            ...verification.data,
          },
        };
      },
      { url: 'https://parabank.parasoft.com/parabank/register.htm' }
    );

    return finalizeScenario(sessionRun);
  },
};
