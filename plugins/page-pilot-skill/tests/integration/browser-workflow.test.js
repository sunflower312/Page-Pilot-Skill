import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runActions } from '../../scripts/lib/action-runner.js';
import { waitForActionStability } from '../../scripts/lib/action-stability.js';
import { BrowserManager } from '../../scripts/lib/browser-manager.js';
import { buildObservation, captureObservationSnapshot } from '../../scripts/lib/observation.js';
import { collectStructuredPageData } from '../../scripts/lib/structured-scan.js';

const integrationDir = fileURLToPath(new URL('.', import.meta.url));
const fixtureRoot = resolve(integrationDir, '..', 'fixtures');
const pluginRoot = resolve(integrationDir, '..', '..');
const artifactRoot = resolve(pluginRoot, '..', '..', 'artifacts', 'page-pilot-skill');

function startFixtureServer(entryFile = 'structured-page.html') {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
      const target = requestPath === '/' ? `/${entryFile}` : requestPath;
      const filePath = join(fixtureRoot, target);
      try {
        const body = await readFile(filePath);
        const ext = extname(filePath);
        const contentType = ext === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
        res.writeHead(200, { 'content-type': contentType });
        res.end(body);
      } catch (error) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(String(error));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        close: () => new Promise((done) => server.close(done)),
        url: `http://127.0.0.1:${address.port}/${entryFile}`,
      });
    });
  });
}

function startInlineHtmlServer(routes, entryPath = '/') {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
      const route = routes[requestPath];

      if (!route) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Missing inline route for ${requestPath}`);
        return;
      }

      const body = typeof route === 'function' ? route(req) : route;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        close: () => new Promise((done) => server.close(done)),
        url: `http://127.0.0.1:${address.port}${entryPath}`,
      });
    });
  });
}

async function installScanCostInstrumentation(page) {
  await page.evaluate(() => {
    const scope = window;
    scope.__agentBrowserScanCounters = { shadowQueries: 0, frameReads: 0 };

    if (scope.__agentBrowserScanInstrumentationInstalled) {
      return;
    }

    const originalShadowQueryAll = ShadowRoot.prototype.querySelectorAll;
    ShadowRoot.prototype.querySelectorAll = function patchedShadowQueryAll(...args) {
      scope.__agentBrowserScanCounters.shadowQueries += 1;
      return originalShadowQueryAll.apply(this, args);
    };

    const frameDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument');
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
      configurable: true,
      enumerable: frameDescriptor?.enumerable ?? false,
      get() {
        scope.__agentBrowserScanCounters.frameReads += 1;
        return frameDescriptor?.get ? frameDescriptor.get.call(this) : null;
      },
    });

    scope.__agentBrowserScanInstrumentationInstalled = true;
  });
}

async function readAndResetScanCostCounters(page) {
  return page.evaluate(() => {
    const current = { ...(window.__agentBrowserScanCounters ?? { shadowQueries: 0, frameReads: 0 }) };
    window.__agentBrowserScanCounters = { shadowQueries: 0, frameReads: 0 };
    return current;
  });
}

test('browser manager opens a complex page and structured scan returns v2 summaries', async () => {
  const fixtureServer = await startFixtureServer('complex-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const brief = await collectStructuredPageData(session.page, { detailLevel: 'brief' });
    const full = await collectStructuredPageData(session.page, { detailLevel: 'full' });

    assert.match(full.title, /Page Pilot Skill Complex Fixture/);
    assert.equal(brief.summary.retainedInteractiveCount < full.summary.retainedInteractiveCount, true);
    assert.equal(full.document.dialogs.some((dialog) => dialog.name === 'Confirm send'), true);
    assert.equal(full.document.frames[0].title, 'Support frame');
    assert.equal(full.document.shadowHosts[0].css, '#shadow-host');
    assert.equal(full.interactives.buttons.some((entry) => entry.name === 'Do not keep me'), false);
    assert.equal(full.interactives.buttons.some((entry) => entry.testId === 'hidden-test-hook'), true);
    assert.equal(full.interactives.inputs[0].locators.some((candidate) => candidate.strategy === 'label'), true);
    assert.equal(
      full.interactives.buttons.find((entry) => entry.testId === 'primary-action').preferredLocator.strategy,
      'role'
    );
    assert.equal(full.hints.primaryAction.label, 'Confirm send');
    assert.equal(full.schemaVersion, 'scan.v2');
    assert.deepEqual(full.document.regions.forms, [{ name: 'support-form' }]);

    const emailField = full.interactives.inputs.find((entry) => entry.css === '#email');
    assert.equal(emailField.accessibleName, 'Email');
    assert.equal(emailField.visibleText, 'Email');
    assert.deepEqual(emailField.attributes, {
      label: 'Email',
      placeholder: 'email@example.com',
      testId: '',
    });
    assert.equal(emailField.localContext.form?.name, 'support-form');
    assert.equal(emailField.actionability.actionable, true);
    assert.equal(emailField.geometry.width > 0, true);
    assert.equal(emailField.recommendedLocators[0].locator.strategy, 'role');
    assert.equal(emailField.stableFingerprint.role, 'textbox');
    assert.equal(emailField.confidence.level, 'high');

    const actions = await runActions(session.page, [
      { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: 'qa@example.com' },
      { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Send request' } } },
      { type: 'wait_for', value: 50 },
      { type: 'assert_text', locator: { strategy: 'css', value: '#message' }, value: 'Thanks qa@example.com' },
    ]);

    assert.equal(actions.ok, true);
    assert.equal(actions.steps.length, 4);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('structured scan filters non-automatable input types and includes shadow form controls', async () => {
  const fixtureServer = await startFixtureServer('scan-edge-cases.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const full = await collectStructuredPageData(session.page, { detailLevel: 'full' });
    const nameOnlyInput = full.interactives.inputs.find((entry) => entry.css === 'input[name="customerEmail"]');

    assert.match(full.title, /Scan Edge Cases/);
    assert.equal(full.document.shadowHosts.length, 2);
    assert.equal(full.interactives.inputs.some((entry) => entry.css === '#email'), true);
    assert.equal(full.interactives.inputs.some((entry) => entry.name === 'Shadow email' && entry.fromShadow), true);
    assert.equal(full.interactives.inputs.some((entry) => entry.css === '#schedule'), false);
    assert.equal(full.interactives.inputs.some((entry) => entry.css === '#accent'), false);
    assert.equal(full.interactives.inputs.some((entry) => entry.css === '#volume'), false);
    assert.equal(full.interactives.inputs.some((entry) => entry.css === '#upload'), false);
    assert.equal(full.interactives.inputs.some((entry) => entry.css === '#channel-chat'), false);
    assert.equal(full.interactives.inputs.some((entry) => entry.css === '#hidden-token'), false);
    assert.equal(full.interactives.checkboxes.some((entry) => entry.css === '#channel-chat'), false);
    assert.equal(full.hints.formFields.some((entry) => entry.locator?.value === '#channel-chat'), false);
    assert.equal(full.interactives.checkboxes.some((entry) => entry.css === '#agree'), true);
    assert.equal(full.interactives.buttons.some((entry) => entry.css === '#save\\:primary\\.action'), true);
    assert.equal(full.interactives.buttons.some((entry) => entry.css === 'button[data-testid="panel\\"one"]'), true);
    assert.equal(full.interactives.buttons.some((entry) => entry.name === 'Shadow launch' && entry.fromShadow), true);
    assert.equal(full.interactives.buttons.some((entry) => entry.name === 'Hidden shadow action'), false);
    assert.equal(full.interactives.buttons.some((entry) => entry.name === 'Nested shadow action' && entry.fromShadow), true);
    assert.equal(full.interactives.textareas.some((entry) => entry.name === 'Shadow notes' && entry.fromShadow), true);
    assert.equal(full.interactives.selects.some((entry) => entry.name === 'Shadow topic' && entry.fromShadow), true);
    assert.equal(full.interactives.checkboxes.some((entry) => entry.testId === 'shadow-check'), true);
    assert.equal(nameOnlyInput.preferredLocator.strategy, 'css');
    assert.equal(nameOnlyInput.locators[0].strategy, 'css');
    assert.equal(full.hints.formFields.some((entry) => entry.locator?.value === 'input[name="customerEmail"]'), true);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('structured scan keeps workflow buttons and links when chrome fills the early browser-side budget', async () => {
  const fixtureServer = await startFixtureServer('workflow-priority-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const standard = await collectStructuredPageData(session.page, { detailLevel: 'standard' });

    assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#start-plan-button'), true);
    assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#acct-confirmation-next'), true);
    assert.equal(standard.interactives.links.some((entry) => entry.css === '#resume-plan-link'), true);
    assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#chrome-action-12'), false);
    assert.equal(standard.interactives.links.some((entry) => entry.css === '#chrome-link-6'), false);
    assert.equal(standard.hints.primaryAction?.label, 'Next');
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('structured scan infers input submit names and table-row field labels for semantic locators', async () => {
  const inlineServer = await startInlineHtmlServer(
    {
      '/semantic-fields': `
        <!doctype html>
        <html lang="en">
          <body>
            <main>
              <form id="customerForm">
                <table>
                  <tr>
                    <td>First Name:</td>
                    <td><input id="customer.firstName" name="customer.firstName" type="text" /></td>
                  </tr>
                  <tr>
                    <td>Last Name:</td>
                    <td><input id="customer.lastName" name="customer.lastName" type="text" /></td>
                  </tr>
                  <tr>
                    <td colspan="2">
                      <input type="submit" value="Register" />
                    </td>
                  </tr>
                </table>
              </form>
            </main>
          </body>
        </html>
      `,
    },
    '/semantic-fields'
  );
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: inlineServer.url });
    const scan = await collectStructuredPageData(session.page, { detailLevel: 'full' });
    const firstName = scan.interactives.inputs.find((entry) => entry.css === '#customer\\.firstName');
    const submit = scan.interactives.buttons.find((entry) => entry.visibleText === 'Register');

    assert.equal(firstName?.accessibleName, 'First Name:');
    assert.equal(firstName?.localContext.form?.name, 'customerForm');
    assert.equal(firstName?.preferredLocator?.strategy, 'role');
    assert.deepEqual(firstName?.preferredLocator?.value, {
      role: 'textbox',
      name: 'First Name:',
      exact: true,
    });

    assert.equal(submit?.accessibleName, 'Register');
    assert.equal(submit?.visibleText, 'Register');
    assert.equal(submit?.preferredLocator?.strategy, 'role');
    assert.deepEqual(submit?.preferredLocator?.value, {
      role: 'button',
      name: 'Register',
      exact: true,
    });
  } finally {
    await manager.closeAll();
    await inlineServer.close();
  }
});

test('observation keeps workflow controls over chrome when the page has many early actions', async () => {
  const fixtureServer = await startFixtureServer('workflow-priority-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const observation = await captureObservationSnapshot(session.page);
    const labels = observation.semantic.interaction.keyInteractives.map((entry) => entry.label);

    assert.equal(observation.semantic.primaryAction?.label, 'Next');
    assert.equal(labels.includes('Next'), true);
    assert.equal(labels.includes('Start plan'), true);
    assert.equal(labels.includes('Resume plan'), true);
    assert.equal(labels.includes('Cookie settings'), false);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('observation retains workflow controls when early chrome buttons exceed the browser-side budget', async () => {
  const chromeButtons = Array.from({ length: 32 }, (_, index) => `<button type="button">Chrome ${index + 1}</button>`).join('');
  const chromeLinks = Array.from({ length: 16 }, (_, index) => `<a href="/chrome-${index + 1}">Docs ${index + 1}</a>`).join('');
  const inlineServer = await startInlineHtmlServer(
    {
      '/observation-budget': `
        <!doctype html>
        <html lang="en">
          <body>
            <header>
              <nav aria-label="Site chrome">
                ${chromeButtons}
                ${chromeLinks}
              </nav>
            </header>
            <main>
              <section aria-label="Workflow">
                <a href="/resume">Resume plan</a>
                <button type="button">Start plan</button>
              </section>
              <form>
                <label for="email">Email</label>
                <input id="email" type="email" />
                <button type="button">Next</button>
              </form>
            </main>
          </body>
        </html>
      `,
    },
    '/observation-budget'
  );
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: inlineServer.url });
    const observation = await captureObservationSnapshot(session.page);
    const labels = observation.semantic.interaction.keyInteractives.map((entry) => entry.label);

    assert.equal(observation.semantic.primaryAction?.label, 'Next');
    assert.equal(labels.includes('Next'), true);
    assert.equal(labels.includes('Start plan'), true);
    assert.equal(labels.includes('Resume plan'), true);
  } finally {
    await manager.closeAll();
    await inlineServer.close();
  }
});

test('observation and structured scan both retain a late Continue workflow button against non-open dialog chrome', async () => {
  const dialogChromeButtons = Array.from(
    { length: 48 },
    (_, index) => `<button type="button">Dialog chrome ${index + 1}</button>`
  ).join('');
  const inlineServer = await startInlineHtmlServer(
    {
      '/shared-runtime-budget': `
        <!doctype html>
        <html lang="en">
          <body>
            <section role="dialog" aria-hidden="true" aria-label="Background panel">
              ${dialogChromeButtons}
            </section>
            <main>
              <section aria-label="Workflow">
                <button id="continue-plan" type="button">Continue</button>
              </section>
            </main>
          </body>
        </html>
      `,
    },
    '/shared-runtime-budget'
  );
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: inlineServer.url });
    const observation = await captureObservationSnapshot(session.page);
    const standard = await collectStructuredPageData(session.page, { detailLevel: 'standard' });
    const observationLabels = observation.semantic.interaction.keyInteractives.map((entry) => entry.label);

    assert.equal(observationLabels.includes('Continue'), true);
    assert.equal(standard.interactives.buttons.some((entry) => entry.name === 'Continue'), true);
  } finally {
    await manager.closeAll();
    await inlineServer.close();
  }
});

test('observation and structured scan exclude aria-disabled workflow controls from primaryAction selection', async () => {
  const inlineServer = await startInlineHtmlServer(
    {
      '/aria-disabled-workflow': `
        <!doctype html>
        <html lang="en">
          <body>
            <main>
              <section aria-label="Workflow">
                <button id="continue-button" type="button" aria-disabled="true">Continue</button>
                <a id="save-link" href="/save" aria-disabled="true">Save</a>
                <button id="resume-button" type="button">Resume</button>
              </section>
            </main>
          </body>
        </html>
      `,
    },
    '/aria-disabled-workflow'
  );
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: inlineServer.url });
    const observation = await captureObservationSnapshot(session.page);
    const standard = await collectStructuredPageData(session.page, { detailLevel: 'standard' });
    const observationContinue = observation.semantic.interaction.keyInteractives.find((entry) => entry.label === 'Continue');
    const observationSave = observation.semantic.interaction.keyInteractives.find((entry) => entry.label === 'Save');
    const structuredContinue = standard.interactives.buttons.find((entry) => entry.name === 'Continue');
    const structuredSave = standard.interactives.links.find((entry) => entry.name === 'Save');

    assert.equal(observationContinue?.disabled, true);
    assert.equal(structuredContinue?.disabled, true);
    assert.equal(observationSave?.disabled, true);
    assert.equal(structuredSave?.disabled, true);
    assert.equal(observation.semantic.primaryAction?.label, 'Resume');
    assert.equal(standard.hints.primaryAction?.label, 'Resume');
    assert.equal(observation.semantic.primaryAction?.label, standard.hints.primaryAction?.label);
  } finally {
    await manager.closeAll();
    await inlineServer.close();
  }
});

test('structured scan prioritizes the active dialog action and retains next over cancel or skip at the browser-side limit', async () => {
  const fixtureServer = await startFixtureServer('dialog-priority-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const standard = await collectStructuredPageData(session.page, { detailLevel: 'standard' });

    assert.equal(standard.hints.activeDialog?.name, 'Confirm changes');
    assert.equal(standard.hints.primaryAction?.label, 'Continue');
    assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#step-next'), true);
    assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#step-skip'), false);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('structured scan uses the workflow link as primaryAction when buttons are only header chrome', async () => {
  const fixtureServer = await startFixtureServer('link-primary-action-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const standard = await collectStructuredPageData(session.page, { detailLevel: 'standard' });

    assert.equal(standard.interactives.links.some((entry) => entry.css === '#resume-plan-link'), true);
    assert.equal(standard.hints.primaryAction?.label, 'Resume plan');
    assert.deepEqual(standard.hints.primaryAction?.locator, {
      strategy: 'role',
      value: { role: 'link', name: 'Resume plan', exact: true },
    });
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('observation captures shadow DOM text changes', async () => {
  const fixtureServer = await startFixtureServer('complex-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const before = await captureObservationSnapshot(session.page);

    await session.page.evaluate(() => {
      const shadowButton = document.querySelector('#shadow-host').shadowRoot.querySelector('button');
      shadowButton.textContent = 'Shadow save complete';
    });

    const after = await captureObservationSnapshot(session.page);
    const observation = buildObservation(before, after);

    assert.equal(observation.newText.includes('Shadow save complete'), true);
    assert.equal(observation.domChange.buttons, 0);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('observation reports semantic dialog closure and primary action handoff on the dialog fixture', async () => {
  const fixtureServer = await startFixtureServer('dialog-priority-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const before = await captureObservationSnapshot(session.page);

    await session.page.evaluate(() => {
      document.querySelector('#confirm-dialog').close();
    });

    const after = await captureObservationSnapshot(session.page);
    const observation = buildObservation(before, after);

    assert.equal(observation.urlChanged, false);
    assert.equal(observation.semanticDiff.dialogClosed, true);
    assert.equal(observation.semanticDiff.primaryActionChanged, true);
    assert.equal(observation.reasons.includes('dialog_closed'), true);
    assert.equal(observation.reasons.includes('primary_action_changed'), true);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('runActions waits through delayed UI state changes before the next step', async () => {
  const fixtureServer = await startFixtureServer('stability-flow.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const result = await runActions(session.page, [
      { type: 'click', locator: { strategy: 'testId', value: 'start-sync' } },
      { type: 'click', locator: { strategy: 'testId', value: 'continue-flow' } },
      { type: 'assert_text', locator: { strategy: 'css', value: '#status' }, value: 'FINAL' },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.steps[0].stability.settled, true);
    assert.equal(result.steps[0].stability.minObserveMs >= 300, true);
    assert.equal(result.steps[1].stability.settled, true);
    assert.equal(result.steps[1].stability.minObserveMs >= 300, true);
    assert.equal(result.steps[1].locator.strategy, 'testId');
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('runActions records url_change stability for click-driven navigation', async () => {
  const fixtureServer = await startFixtureServer('structured-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const result = await runActions(session.page, [
      { type: 'click', locator: { strategy: 'css', value: 'a[href="/next-page.html"]' } },
    ]);

    assert.equal(result.ok, true);
    assert.match(result.finalUrl, /\/next-page\.html$/);
    assert.equal(result.steps[0].stability.settled, true);
    assert.equal(result.steps[0].stability.trigger, 'url_change');
    assert.equal(result.steps[0].stability.observation?.urlChanged, true);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('runActions records url_change when delayed navigation destroys the previous document stability observer', async () => {
  const inlineServer = await startInlineHtmlServer(
    {
      '/start': `
        <!doctype html>
        <html lang="en">
          <body>
            <button id="next" type="button">Next</button>
            <script>
              document.getElementById('next').addEventListener('click', () => {
                setTimeout(() => {
                  window.location.href = '/finish';
                }, 20);
              });
            </script>
          </body>
        </html>
      `,
      '/finish': `
        <!doctype html>
        <html lang="en">
          <body>
            <main>
              <h1>Finish</h1>
              <p>Password step is ready</p>
            </main>
          </body>
        </html>
      `,
    },
    '/start'
  );
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: inlineServer.url });
    const result = await runActions(session.page, [
      { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Next' } } },
    ]);

    assert.equal(result.ok, true);
    assert.match(result.finalUrl, /\/finish$/);
    assert.equal(result.steps[0].stability.status, 'settled');
    assert.equal(result.steps[0].stability.settled, true);
    assert.equal(result.steps[0].stability.trigger, 'url_change');
    assert.equal(result.steps[0].stability.observation?.urlChanged, true);
    assert.equal(result.steps[0].stability.observation?.newText.includes('Password step is ready'), true);
  } finally {
    await manager.closeAll();
    await inlineServer.close();
  }
});

test('runActions waits through delayed shadow DOM-only state changes before the next step', async () => {
  const fixtureServer = await startFixtureServer('shadow-stability-flow.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const result = await runActions(session.page, [
      { type: 'click', locator: { strategy: 'testId', value: 'shadow-start' } },
      { type: 'click', locator: { strategy: 'testId', value: 'shadow-continue' } },
      { type: 'assert_text', locator: { strategy: 'css', value: '#shadow-status' }, value: 'FINAL SHADOW' },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.steps[0].stability.settled, true);
    assert.equal(result.steps[0].stability.minObserveMs >= 300, true);
    assert.equal(result.steps[1].stability.settled, true);
    assert.equal(result.steps[1].locator.strategy, 'testId');
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('collectStructuredPageData includes shadow DOM text in scan summaries', async () => {
  const fixtureServer = await startFixtureServer('shadow-stability-flow.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    await runActions(session.page, [{ type: 'click', locator: { strategy: 'testId', value: 'shadow-start' } }]);
    await session.page.evaluate(() => {
      const host = document.querySelector('#shadow-flow-host');
      host.shadowRoot.querySelector('#shadow-status').textContent = 'FINAL SHADOW';
    });

    const full = await collectStructuredPageData(session.page, { detailLevel: 'full' });

    assert.equal(full.summary.mainText.includes('FINAL SHADOW'), true);
    assert.equal(full.document.shadowHosts.some((entry) => entry.text.includes('FINAL SHADOW')), true);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('waitForActionStability observes delayed updates inside open shadow DOM', async () => {
  const fixtureServer = await startFixtureServer('shadow-stability-flow.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    await session.page.getByTestId('shadow-start').click();

    const stability = await waitForActionStability(session.page, {
      settleMs: 120,
      minObserveMs: 350,
      timeoutMs: 1500,
    });
    const shadowState = await session.page.evaluate(() => {
      const root = document.querySelector('#shadow-flow-host').shadowRoot;
      return {
        status: root.querySelector('#shadow-status').textContent,
        continueDisabled: root.querySelector('[data-testid="shadow-continue"]').disabled,
      };
    });

    assert.equal(stability.settled, true);
    assert.equal(shadowState.continueDisabled, false);
    assert.equal(shadowState.status, 'READY FOR NEXT SHADOW STEP');
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('waitForActionStability reports semantic changes for delayed enablement on the stability fixture', async () => {
  const fixtureServer = await startFixtureServer('stability-flow.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    const before = await captureObservationSnapshot(session.page);

    await session.page.getByTestId('start-sync').click();

    const stability = await waitForActionStability(session.page, {
      settleMs: 120,
      minObserveMs: 350,
      timeoutMs: 1500,
    }, { before });

    assert.equal(stability.trigger, 'dom_change');
    assert.equal(stability.observation?.semanticDiff?.mainRegionChanged, true);
    assert.equal(stability.observation?.semanticDiff?.feedbackChanged, true);
    assert.equal(stability.observation?.semanticDiff?.interactionStateChanged, true);
    assert.equal(stability.observation?.reasons.includes('main_region_changed'), true);
    assert.equal(stability.observation?.reasons.includes('feedback_changed'), true);
    assert.equal(stability.observation?.reasons.includes('interaction_state_changed'), true);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('observation captures checkbox toggles as semantic interaction changes even without text changes', async () => {
  const inlineServer = await startInlineHtmlServer(
    {
      '/checkbox-observation': `
        <!doctype html>
        <html lang="en">
          <body>
            <main>
              <form>
                <label>
                  <input type="checkbox" name="updates" />
                  Receive product updates
                </label>
              </form>
            </main>
          </body>
        </html>
      `,
    },
    '/checkbox-observation'
  );
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: inlineServer.url });
    const before = await captureObservationSnapshot(session.page);

    await session.page.getByLabel('Receive product updates').check();

    const after = await captureObservationSnapshot(session.page);
    const observation = buildObservation(before, after);

    assert.deepEqual(observation.newText, []);
    assert.deepEqual(observation.removedText, []);
    assert.equal(Object.values(observation.domChange).every((delta) => delta === 0), true);
    assert.equal(observation.semanticDiff.interactionStateChanged, true);
    assert.equal(observation.semanticDiff.details.interaction.before.checkedCount, 0);
    assert.equal(observation.semanticDiff.details.interaction.after.checkedCount, 1);
    assert.equal(observation.semanticDiff.details.interaction.after.keyInteractives[0].checked, true);
  } finally {
    await manager.closeAll();
    await inlineServer.close();
  }
});

test('collectStructuredPageData reduces browser-side shadow and frame work for brief scans', async () => {
  const fixtureServer = await startFixtureServer('complex-page.html');
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: fixtureServer.url });
    await installScanCostInstrumentation(session.page);

    const brief = await collectStructuredPageData(session.page, { detailLevel: 'brief' });
    const briefCosts = await readAndResetScanCostCounters(session.page);
    const full = await collectStructuredPageData(session.page, { detailLevel: 'full' });
    const fullCosts = await readAndResetScanCostCounters(session.page);

    assert.equal(brief.ok, true);
    assert.equal(full.ok, true);
    assert.equal(brief.document.frames.length, 1);
    assert.equal(full.document.frames.length, 1);
    assert.equal(fullCosts.frameReads > briefCosts.frameReads, true);
    assert.equal(fullCosts.shadowQueries > briefCosts.shadowQueries, true);
  } finally {
    await manager.closeAll();
    await fixtureServer.close();
  }
});

test('runActions recovers custom checkbox checks when the input is covered by an overlay inside the label', async () => {
  const inlineServer = await startInlineHtmlServer(
    {
      '/checkbox': `
        <!doctype html>
        <html lang="en">
          <head>
            <style>
              body {
                font-family: sans-serif;
                padding: 24px;
              }

              label.share-toggle {
                position: relative;
                display: inline-flex;
                align-items: center;
                min-height: 24px;
                cursor: pointer;
              }

              input[type="checkbox"] {
                position: absolute;
                inset: 0 auto auto 0;
                width: 24px;
                height: 24px;
                margin: 0;
                opacity: 0;
              }

              span.checkbox-check {
                position: absolute;
                left: 0;
                top: 0;
                width: 24px;
                height: 24px;
                background: #1f2937;
                border-radius: 4px;
                pointer-events: auto;
              }

              span.label-text {
                padding-left: 36px;
              }
            </style>
          </head>
          <body>
            <label class="share-toggle">
              <input data-testid="share-progress" type="checkbox" />
              <span class="checkbox-check" aria-hidden="true"></span>
              <span class="label-text">Yes, I agree to share my progress</span>
            </label>
            <p id="status">Pending</p>
            <script>
              const checkbox = document.querySelector('[data-testid="share-progress"]');
              const status = document.getElementById('status');
              checkbox.addEventListener('change', () => {
                status.textContent = checkbox.checked ? 'Shared' : 'Pending';
              });
            </script>
          </body>
        </html>
      `,
    },
    '/checkbox'
  );
  const manager = new BrowserManager({
    artifactRoot,
    idleMs: 30000,
  });

  try {
    const session = await manager.openSession({ url: inlineServer.url });
    const result = await runActions(session.page, [
      { type: 'check', locator: { strategy: 'testId', value: 'share-progress' } },
      { type: 'assert_text', locator: { strategy: 'css', value: '#status' }, value: 'Shared' },
    ]);

    const checked = await session.page.getByTestId('share-progress').isChecked();

    assert.equal(result.ok, true);
    assert.equal(result.steps[0].type, 'check');
    assert.equal(checked, true);
    assert.equal(result.steps[1].ok, true);
  } finally {
    await manager.closeAll();
    await inlineServer.close();
  }
});
