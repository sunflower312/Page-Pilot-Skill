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
    { type: 'assert_text', locator: { strategy: 'css', value: '#leftPanel' }, value: 'Open New Account' },
  ];
}

const verifyRegistrationScript = `
  const bodyText = document.body.textContent.replace(/\\s+/g, ' ').trim();
  const accountLinks = [...document.querySelectorAll('#leftPanel a')].map((link) => link.textContent.trim()).filter(Boolean);
  if (!bodyText.includes('Welcome Bench User')) {
    throw new Error('The ParaBank welcome text is missing after registration.');
  }
  if (!accountLinks.includes('Open New Account')) {
    throw new Error('Open New Account link is missing after registration.');
  }
  return {
    title: document.title,
    accountLinks,
  };
`;

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
        await scanPage(context, sessionId, 'Scan the ParaBank registration page for the open-account flow', 'brief');
        await validatePlaywright(
          context,
          sessionId,
          'Register a new ParaBank customer for the open-account flow',
          registrationActions('{{pagePilot.uniqueUsername:parabank-open-account}}')
        );
        await runProbe(
          context,
          sessionId,
          'Verify the post-registration account overview links for the open-account flow',
          verifyRegistrationScript,
          (data) => ({
            title: data.title,
            accountLinks: data.accountLinks.slice(0, 4),
          })
        );
        await validatePlaywright(context, sessionId, 'Open the account services page for a new account', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Open New Account' } } },
        ]);
        await ensureOpenAccountPageAvailable(context, sessionId);
        await validatePlaywright(context, sessionId, 'Submit the ParaBank open-account form', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Open New Account' } } },
          { type: 'assert_text', locator: { strategy: 'text', value: 'Account Opened!' }, value: 'Account Opened!' },
        ]);
        const verification = await runProbe(
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
            ...verification.data,
          },
        };
      },
      { url: 'https://parabank.parasoft.com/parabank/register.htm' }
    );

    return finalizeScenario(sessionRun);
  },
};
