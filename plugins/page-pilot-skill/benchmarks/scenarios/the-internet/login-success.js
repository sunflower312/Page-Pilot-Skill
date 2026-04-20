import {
  captureScreenshot,
  runProbe,
  validatePlaywright,
  scanPage,
} from '../_shared/scenario-tools.js';

const loginReadinessScript = `
  return {
    title: document.title,
    hasUsername: document.querySelectorAll('#username').length > 0,
    hasPassword: document.querySelectorAll('#password').length > 0,
    hasForm: document.querySelectorAll('form').length > 0,
    frameSrc: document.querySelector('iframe')?.src ?? null,
  };
`;

const verifySecureAreaScript = `
  const flashText = document.querySelector('#flash')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
  const logoutHref = document.querySelector('a[href="/logout"]')?.href ?? null;
  if (!flashText.includes('You logged into a secure area!')) {
    throw new Error('Secure-area success flash is missing.');
  }
  if (!logoutHref) {
    throw new Error('Logout link is missing on the secure page.');
  }
  return {
    flashText,
    logoutHref,
  };
`;

function createSiteUnavailableError(lastProbe) {
  const error = new Error('The target site did not expose the expected login page after repeated attempts.');
  error.code = 'SITE_UNAVAILABLE';
  error.details = {
    expected: 'The Internet login form with #username and #password inputs.',
    lastProbe,
  };
  return error;
}

async function openReadySession(context, attempts = 3, delayMs = 1000) {
  let lastProbe = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const session = await context.openSession();
    context.recordStep(`Open target page (attempt ${attempt})`, 'passed', {
      url: session.url ?? context.scenario.entryUrl ?? context.site.baseUrl,
      title: session.title ?? null,
    });

    const probe = await runProbe(
      context,
      session.sessionId,
      `Probe login-page readiness (attempt ${attempt})`,
      loginReadinessScript,
      (data) => data
    );
    lastProbe = probe.data;

    if (probe.data.hasUsername && probe.data.hasPassword && probe.data.hasForm) {
      return {
        sessionId: session.sessionId,
        session,
        probe: probe.data,
      };
    }

    await context.closeSession(session.sessionId);
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw createSiteUnavailableError(lastProbe);
}

export const scenario = {
  async run(context) {
    const sessionInfo = await openReadySession(context);
    const artifacts = [];

    try {
      await scanPage(context, sessionInfo.sessionId, 'Scan the login page', 'brief');
      await validatePlaywright(context, sessionInfo.sessionId, 'Submit the demo credentials', [
        {
          type: 'fill',
          locator: { strategy: 'css', value: '#username' },
          fallbackLocators: [
            { strategy: 'role', value: { role: 'textbox', name: 'Username' } },
            { strategy: 'label', value: 'Username' },
          ],
          value: 'tomsmith',
        },
        {
          type: 'fill',
          locator: { strategy: 'css', value: '#password' },
          fallbackLocators: [
            { strategy: 'role', value: { role: 'textbox', name: 'Password' } },
            { strategy: 'label', value: 'Password' },
          ],
          value: 'SuperSecretPassword!',
        },
        { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Login' } } },
        { type: 'assert_url', value: '/secure' },
      ]);
      const verification = await runProbe(
        context,
        sessionInfo.sessionId,
        'Verify the secure-area flash and logout link',
        verifySecureAreaScript,
        (data) => ({
          flashText: data.flashText,
          logoutHref: data.logoutHref,
        })
      );
      artifacts.push(await captureScreenshot(context, sessionInfo.sessionId, 'the-internet-secure-area'));
      return {
        summary: 'Logged into the secure area with the demo credentials.',
        details: verification.data,
        artifacts,
      };
    } finally {
      await context.closeSession(sessionInfo.sessionId);
    }
  },
};
