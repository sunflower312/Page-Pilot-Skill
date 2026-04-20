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
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.lastName' }, value: 'Transfer' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.street' }, value: '7 Transfer Road' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.city' }, value: 'Flowtown' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.state' }, value: 'CA' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.address\\.zipCode' }, value: '90001' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.phoneNumber' }, value: '5553334444' },
    { type: 'fill', locator: { strategy: 'css', value: '#customer\\.ssn' }, value: '444556666' },
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
  if (!bodyText.includes('Welcome Bench Transfer')) {
    throw new Error('The ParaBank welcome text is missing after registration.');
  }
  if (!accountLinks.includes('Open New Account')) {
    throw new Error('Open New Account link is missing after registration.');
  }
  if (!accountLinks.includes('Transfer Funds')) {
    throw new Error('Transfer Funds link is missing after registration.');
  }
  return {
    title: document.title,
    accountLinks,
  };
`;

const extractNewAccountIdScript = `
  const accountId = document.querySelector('#newAccountId')?.textContent?.trim() ?? '';
  if (!accountId) {
    throw new Error('Open New Account did not expose a new account id.');
  }
  return { accountId };
`;

const readTransferOptionsScript = `
  const fromOptions = [...document.querySelectorAll('#fromAccountId option')].map((option) => ({
    value: option.value,
    text: option.textContent.trim(),
  }));
  const toOptions = [...document.querySelectorAll('#toAccountId option')].map((option) => ({
    value: option.value,
    text: option.textContent.trim(),
  }));
  if (fromOptions.length < 2) {
    throw new Error(\`Expected at least two source accounts, found \${fromOptions.length}.\`);
  }
  if (toOptions.length < 2) {
    throw new Error(\`Expected at least two destination accounts, found \${toOptions.length}.\`);
  }
  return { fromOptions, toOptions };
`;

function buildVerifyTransferResultScript(destinationAccountId) {
  return `
    const bodyText = document.body.textContent.replace(/\\s+/g, ' ').trim();
    const amountText = document.querySelector('#amountResult')?.textContent?.trim() ?? '';
    const destinationText = document.querySelector('#toAccountIdResult')?.textContent?.trim() ?? '';
    if (!/Transfer Complete!/i.test(bodyText)) {
      throw new Error('Transfer Funds did not reach the completion state.');
    }
    if (!amountText.includes('25')) {
      throw new Error(\`Transfer amount result is unexpected: \${amountText}\`);
    }
    if (!destinationText.includes(${JSON.stringify(destinationAccountId)})) {
      throw new Error(\`Transfer destination result is unexpected: \${destinationText}\`);
    }
    return {
      amountText,
      destinationText,
      bodyText: bodyText.slice(0, 260),
    };
  `;
}

async function ensureOpenAccountPageAvailable(context, sessionId) {
  const snapshot = await runProbe(
    context,
    sessionId,
    'Inspect the ParaBank open-account page availability',
    {
      template: 'document_snapshot',
      maxTextLength: 2500,
      timeoutMs: 3000,
    },
    (data) => ({
      title: data.title,
      url: data.url,
      textLength: data.textLength,
    })
  );

  const combinedText = `${snapshot.data.title ?? ''}\n${snapshot.data.text ?? ''}`;
  if (/application error|an internal error has occurred and has been logged/i.test(combinedText)) {
    const error = new Error('ParaBank open-account sandbox is temporarily unavailable.');
    error.code = 'EXTERNAL_SITE_UNAVAILABLE';
    error.details = {
      url: snapshot.data.url ?? null,
      title: snapshot.data.title ?? null,
    };
    throw error;
  }

  return snapshot;
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the ParaBank registration page for the transfer-funds flow', 'brief');
        await validatePlaywright(
          context,
          sessionId,
          'Register a new ParaBank demo customer for the transfer flow',
          registrationActions('{{pagePilot.uniqueUsername:parabank-transfer}}')
        );
        await runProbe(
          context,
          sessionId,
          'Verify the post-registration account overview links for the transfer flow',
          verifyRegistrationScript,
          (data) => ({
            title: data.title,
            accountLinks: data.accountLinks.slice(0, 5),
          })
        );
        await validatePlaywright(context, sessionId, 'Open the account services page for a destination account', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Open New Account' } } },
        ]);
        await ensureOpenAccountPageAvailable(context, sessionId);
        await validatePlaywright(context, sessionId, 'Create a second account for transfer destination coverage', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Open New Account' } } },
          { type: 'assert_text', locator: { strategy: 'text', value: 'Account Opened!' }, value: 'Account Opened!' },
        ]);
        const accountCreation = await runProbe(
          context,
          sessionId,
          'Extract the newly created destination account id',
          extractNewAccountIdScript,
          (data) => ({ accountId: data.accountId })
        );

        await validatePlaywright(context, sessionId, 'Open the Transfer Funds page', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Transfer Funds' } } },
        ]);
        const readiness = await runProbe(
          context,
          sessionId,
          'Inspect transfer account options',
          readTransferOptionsScript,
          (data) => ({
            fromAccountCount: data.fromOptions.length,
            toAccountCount: data.toOptions.length,
          })
        );

        const destinationAccountId =
          readiness.data.toOptions.find((option) => option.value === accountCreation.data.accountId)?.value ??
          readiness.data.toOptions[readiness.data.toOptions.length - 1]?.value;
        const sourceAccountId =
          readiness.data.fromOptions.find((option) => option.value !== destinationAccountId)?.value ??
          readiness.data.fromOptions[0]?.value;

        if (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId) {
          throw new Error('Transfer Funds did not expose distinct source and destination accounts.');
        }

        await validatePlaywright(context, sessionId, 'Submit the transfer between two ParaBank accounts', [
          { type: 'fill', locator: { strategy: 'css', value: '#amount' }, value: '25' },
          { type: 'select', locator: { strategy: 'css', value: '#fromAccountId' }, value: '{{pagePilot.option:first}}' },
          { type: 'select', locator: { strategy: 'css', value: '#toAccountId' }, value: '{{pagePilot.option:last}}' },
          { type: 'click', locator: { strategy: 'css', value: 'input[value="Transfer"]' } },
          { type: 'assert_text', locator: { strategy: 'text', value: 'Transfer Complete!' }, value: 'Transfer Complete!' },
        ]);

        const verification = await runProbe(
          context,
          sessionId,
          'Verify the transfer completion state',
          buildVerifyTransferResultScript(destinationAccountId),
          (data) => ({
            amountText: data.amountText,
            destinationText: data.destinationText,
          })
        );

        addArtifact(await captureScreenshot(context, sessionId, 'parabank-transfer-funds'));
        return {
          summary: 'Registered a ParaBank customer, opened a second account, and completed a transfer.',
          details: {
            newAccountId: accountCreation.data.accountId,
            sourceAccountId,
            destinationAccountId,
            ...verification.data,
          },
        };
      },
      { url: 'https://parabank.parasoft.com/parabank/register.htm' }
    );

    return finalizeScenario(sessionRun);
  },
};
