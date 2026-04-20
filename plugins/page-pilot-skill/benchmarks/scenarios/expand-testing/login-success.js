import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const verifySecurePageScript = `
  const successText = document.body.textContent.includes('You logged into a secure area!');
  const logoutHref = document.querySelector('a[href="/logout"]')?.href ?? null;
  const heading = document.querySelector('h1')?.textContent?.trim() ?? '';
  if (!successText) {
    throw new Error('Secure-page success text is missing.');
  }
  if (heading !== 'Secure Area page for Automation Testing Practice') {
    throw new Error(\`Unexpected secure-page heading: \${heading || 'missing'}.\`);
  }
  if (!logoutHref) {
    throw new Error('Logout link is missing on the secure page.');
  }
  return {
    successText,
    logoutHref,
    heading,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the practice login page', 'brief');
        await validatePlaywright(context, sessionId, 'Submit the practice credentials', [
          { type: 'fill', locator: { strategy: 'label', value: 'Username' }, value: 'practice' },
          { type: 'fill', locator: { strategy: 'label', value: 'Password' }, value: 'SuperSecretPassword!' },
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Login' } } },
          { type: 'assert_url', value: '/secure' },
        ]);
        const verification = await runProbe(
          context,
          sessionId,
          'Verify the secure page state',
          verifySecurePageScript,
          (data) => ({
            successText: data.successText,
            heading: data.heading,
            logoutHref: data.logoutHref,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'expand-testing-secure-page'));
        return {
          summary: 'Logged into the Expand Testing secure area with the practice credentials.',
          details: verification.data,
        };
      },
      {
        url: 'https://practice.expandtesting.com/login',
        waitUntil: 'domcontentloaded',
        timeoutMs: 30000,
      }
    );

    return finalizeScenario(sessionRun);
  },
};
