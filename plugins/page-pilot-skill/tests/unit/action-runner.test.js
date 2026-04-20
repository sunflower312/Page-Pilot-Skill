import test from 'node:test';
import assert from 'node:assert/strict';

import { runActions } from '../../scripts/lib/action-runner.js';

test('runActions executes fill, click, wait_for, and assert_text in order', async () => {
  const calls = [];
  const page = {
    getByLabel(value) {
      return {
        async fill(input) {
          calls.push(['fill', value, input]);
        },
      };
    },
    getByRole(role, options = {}) {
      return {
        async click() {
          calls.push(['click', role, options.name]);
        },
      };
    },
    async waitForTimeout(value) {
      calls.push(['wait', value]);
    },
    locator(selector) {
      return {
        async evaluate(callback) {
          calls.push(['evaluate', selector]);
          return callback({
            tagName: 'P',
            textContent: 'Thanks qa@example.com',
          });
        },
      };
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [
    { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: 'qa@example.com' },
    { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Submit' } } },
    { type: 'wait_for', value: 25 },
    { type: 'assert_text', locator: { strategy: 'css', value: '#message' }, value: 'Thanks qa@example.com' },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['fill', 'Email', 'qa@example.com'],
    ['click', 'button', 'Submit'],
    ['wait', 25],
    ['evaluate', '#message'],
  ]);
  assert.equal(result.steps[0].type, 'fill');
  assert.equal(result.steps[3].ok, true);
});

test('runActions resolves runtime tokens consistently across fill and assertion steps', async () => {
  const calls = [];
  let submittedEmail = '';
  const page = {
    getByLabel(value) {
      return {
        async fill(input) {
          submittedEmail = input;
          calls.push(['fill', value, input]);
        },
      };
    },
    getByRole(role, options = {}) {
      return {
        async click() {
          calls.push(['click', role, options.name]);
        },
      };
    },
    locator(selector) {
      return {
        async evaluate(callback) {
          calls.push(['evaluate', selector]);
          return callback({
            tagName: 'P',
            textContent: `Thanks ${submittedEmail}`,
          });
        },
      };
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [
    { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: '{{pagePilot.uniqueEmail}}' },
    { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Submit' } } },
    { type: 'assert_text', locator: { strategy: 'css', value: '#message' }, value: 'Thanks {{pagePilot.uniqueEmail}}' },
  ]);

  assert.equal(result.ok, true);
  assert.match(calls[0][2], /^pp.+@example\.test$/);
  assert.equal(result.steps[0].value, '{{pagePilot.uniqueEmail}}');
  assert.equal(result.steps[0].resolvedValue, calls[0][2]);
  assert.equal(result.steps[2].resolvedValue, `Thanks ${calls[0][2]}`);
});

test('runActions resolves runtime tokens consistently across navigate and assert_url steps', async () => {
  const calls = [];
  let currentUrl = 'http://fixture.local/';
  const page = {
    async goto(url) {
      currentUrl = url;
      calls.push(['goto', url]);
    },
    url() {
      return currentUrl;
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [
    { type: 'navigate', url: 'http://fixture.local/session/{{pagePilot.uniqueId}}', waitUntil: 'commit' },
    { type: 'assert_url', value: '/session/{{pagePilot.uniqueId}}' },
  ]);

  assert.equal(result.ok, true);
  assert.match(calls[0][1], /^http:\/\/fixture\.local\/session\/pp[a-z0-9]+$/);
  assert.equal(result.steps[0].url, 'http://fixture.local/session/{{pagePilot.uniqueId}}');
  assert.equal(result.steps[1].value, '/session/{{pagePilot.uniqueId}}');
});

test('runActions supports rich locator strategies and extended action types', async () => {
  const calls = [];
  const page = {
    getByText(value) {
      return {
        async click() {
          calls.push(['clickText', value]);
        },
      };
    },
    getByPlaceholder(value) {
      return {
        async fill(input) {
          calls.push(['fillPlaceholder', value, input]);
        },
      };
    },
    getByTestId(value) {
      return {
        async check() {
          calls.push(['checkTestId', value]);
        },
      };
    },
    locator(value) {
      return {
        async selectOption(option) {
          calls.push(['selectCss', value, option]);
        },
        async press(key) {
          calls.push(['pressCss', value, key]);
        },
        async screenshot(options = {}) {
          calls.push(['captureCss', value, options.path]);
        },
      };
    },
    async goto(url, options = {}) {
      calls.push(['goto', url, options.waitUntil ?? null]);
    },
    async waitForTimeout(value) {
      calls.push(['wait', value]);
    },
    url() {
      return 'http://fixture.local/next-page.html';
    },
    async title() {
      return 'Next Page';
    },
  };

  const result = await runActions(
    page,
    [
      { type: 'navigate', url: 'http://fixture.local/next-page.html', waitUntil: 'domcontentloaded' },
      { type: 'click', locator: { strategy: 'text', value: 'Open details' } },
      { type: 'fill', locator: { strategy: 'placeholder', value: 'Search inventory' }, value: 'wireless mouse' },
      { type: 'check', locator: { strategy: 'testId', value: 'terms-checkbox' } },
      { type: 'select', locator: { strategy: 'css', value: '#priority' }, value: 'high' },
      { type: 'press', locator: { strategy: 'css', value: '#search' }, value: 'Enter' },
      { type: 'capture', locator: { strategy: 'css', value: '#results' } },
      { type: 'wait_for', value: 10 },
      { type: 'assert_url', value: '/next-page.html' },
    ],
    {
      capture: async (action, _page, locator) => {
        await locator.screenshot({ path: '/tmp/results.png' });
        calls.push(['capture', action.locator.value]);
        return '/tmp/results.png';
      },
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['goto', 'http://fixture.local/next-page.html', 'domcontentloaded'],
    ['clickText', 'Open details'],
    ['fillPlaceholder', 'Search inventory', 'wireless mouse'],
    ['checkTestId', 'terms-checkbox'],
    ['selectCss', '#priority', 'high'],
    ['pressCss', '#search', 'Enter'],
    ['captureCss', '#results', '/tmp/results.png'],
    ['capture', '#results'],
    ['wait', 10],
  ]);
  assert.equal(result.finalUrl, 'http://fixture.local/next-page.html');
  assert.equal(result.finalTitle, 'Next Page');
  assert.equal(result.steps[6].path, '/tmp/results.png');
});

test('runActions resolves select option position tokens against the current select element', async () => {
  const calls = [];
  const page = {
    locator(selector) {
      return {
        async evaluate(callback, position) {
          calls.push(['evaluateSelect', selector, position]);
          return callback(
            {
              options: [
                { value: '11111', label: '11111', textContent: '11111' },
                { value: '22222', label: '22222', textContent: '22222' },
              ],
            },
            position
          );
        },
        async selectOption(option) {
          calls.push(['selectCss', selector, option]);
        },
      };
    },
    url() {
      return 'http://fixture.local/transfer';
    },
    async title() {
      return 'Transfer';
    },
  };

  const result = await runActions(page, [
    { type: 'select', locator: { strategy: 'css', value: '#fromAccountId' }, value: '{{pagePilot.option:first}}' },
    { type: 'select', locator: { strategy: 'css', value: '#toAccountId' }, value: '{{pagePilot.option:last}}' },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['evaluateSelect', '#fromAccountId', 'first'],
    ['selectCss', '#fromAccountId', '11111'],
    ['evaluateSelect', '#toAccountId', 'last'],
    ['selectCss', '#toAccountId', '22222'],
  ]);
  assert.equal(result.steps[0].resolvedValue, '11111');
  assert.equal(result.steps[1].resolvedValue, '22222');
});

test('runActions preserves navigate waitUntil on recorded steps', async () => {
  const calls = [];
  const page = {
    async goto(url, options = {}) {
      calls.push(['goto', url, options.waitUntil ?? null]);
    },
    async waitForLoadState(state) {
      calls.push(['waitForLoadState', state]);
    },
    async waitForFunction() {
      calls.push(['waitForFunction']);
    },
    url() {
      return 'http://fixture.local/streaming';
    },
    async title() {
      return 'Streaming fixture';
    },
  };

  const result = await runActions(page, [{ type: 'navigate', url: 'http://fixture.local/streaming', waitUntil: 'commit' }]);

  assert.equal(result.ok, true);
  assert.equal(result.steps[0].type, 'navigate');
  assert.equal(result.steps[0].waitUntil, 'commit');
  assert.equal(result.steps[0].stability.settled, true);
  assert.deepEqual(calls, [
    ['goto', 'http://fixture.local/streaming', 'commit'],
    ['waitForLoadState', 'domcontentloaded'],
    ['waitForFunction'],
  ]);
});

test('runActions returns structured step failures', async () => {
  const page = {
    getByText() {
      return {
        async click() {
          throw new Error('Element is detached');
        },
      };
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [{ type: 'click', locator: { strategy: 'text', value: 'Detached button' } }]);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ACTION_STEP_FAILED');
  assert.equal(result.error.stepIndex, 0);
  assert.match(result.error.message, /Element is detached/);
});

test('runActions keeps completed steps when a later action fails', async () => {
  const calls = [];
  const page = {
    getByLabel(value) {
      return {
        async fill(input) {
          calls.push(['fill', value, input]);
        },
      };
    },
    getByText() {
      return {
        async click() {
          throw new Error('Later click failed');
        },
      };
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [
    { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: 'qa@example.com' },
    { type: 'click', locator: { strategy: 'text', value: 'Broken button' } },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].type, 'fill');
  assert.equal(result.steps[0].ok, true);
  assert.deepEqual(result.steps[0].locator, { strategy: 'label', value: 'Email' });
  assert.equal(result.steps[1].type, 'click');
  assert.equal(result.steps[1].ok, false);
});

test('runActions assert_text reads form control values', async () => {
  const page = {
    locator(selector) {
      return {
        async evaluate(callback) {
          if (selector === '#email') {
            return callback({
              tagName: 'INPUT',
              value: 'qa@example.com',
              textContent: '',
            });
          }

          return callback({
            tagName: 'SELECT',
            selectedOptions: [{ label: 'High', textContent: 'High', value: 'high' }],
            textContent: 'Low High',
          });
        },
      };
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [
    { type: 'assert_text', locator: { strategy: 'css', value: '#email' }, value: 'qa@example.com' },
    { type: 'assert_text', locator: { strategy: 'css', value: '#priority' }, value: 'High' },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.steps.length, 2);
});

test('runActions assert_text preserves containment semantics for form controls', async () => {
  const page = {
    locator(selector) {
      return {
        async evaluate(callback) {
          if (selector === '#email') {
            return callback({
              tagName: 'TEXTAREA',
              value: 'line 1\nqa@example.com\nline 3',
              textContent: '',
            });
          }

          return callback({
            tagName: 'SELECT',
            selectedOptions: [
              { label: 'Priority High', textContent: 'Priority High', value: 'high' },
              { label: 'Needs Review', textContent: 'Needs Review', value: 'review' },
            ],
            textContent: 'Priority High Needs Review',
          });
        },
      };
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [
    { type: 'assert_text', locator: { strategy: 'css', value: '#email' }, value: 'example.com' },
    { type: 'assert_text', locator: { strategy: 'css', value: '#topics' }, value: 'High Needs' },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.steps[0].assertionSource, 'value');
  assert.equal(result.steps[1].assertionSource, 'selectedText');
});

test('runActions keeps capture steps successful when the target disappears after the screenshot', async () => {
  let resolutionCount = 0;
  const transientLocator = {
    async count() {
      resolutionCount += 1;
      return resolutionCount === 1 ? 1 : 0;
    },
    first() {
      return this;
    },
    async isVisible() {
      return true;
    },
    async screenshot(options = {}) {
      return options.path;
    },
  };
  const page = {
    getByTestId() {
      return transientLocator;
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(
    page,
    [{ type: 'capture', locator: { strategy: 'testId', value: 'flash-banner' } }],
    {
      capture: async (_action, _page, locator) => {
        await locator.screenshot({ path: '/tmp/flash-banner.png' });
        return '/tmp/flash-banner.png';
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.steps[0].type, 'capture');
  assert.equal(result.steps[0].path, '/tmp/flash-banner.png');
  assert.deepEqual(result.steps[0].locator, { strategy: 'testId', value: 'flash-banner' });
  assert.equal(resolutionCount, 1);
});

test('runActions verifies locator fallbacks and waits for stability after mutating actions', async () => {
  const calls = [];
  const primaryLocator = {
    async count() {
      return 2;
    },
    first() {
      return this;
    },
  };
  const fallbackLocator = {
    async count() {
      return 1;
    },
    first() {
      return this;
    },
    async isVisible() {
      return true;
    },
    async isEnabled() {
      return true;
    },
    async click() {
      calls.push(['click', 'continue-btn']);
    },
  };
  const page = {
    getByRole() {
      return primaryLocator;
    },
    getByTestId() {
      return fallbackLocator;
    },
    async waitForLoadState(state) {
      calls.push(['waitForLoadState', state]);
    },
    async waitForFunction() {
      calls.push(['waitForFunction']);
    },
    url() {
      return 'http://fixture.local/checkout';
    },
    async title() {
      return 'Checkout';
    },
  };

  const result = await runActions(page, [
    {
      type: 'click',
      locator: { strategy: 'role', value: { role: 'button', name: 'Continue' } },
      fallbackLocators: [{ strategy: 'testId', value: 'continue-btn' }],
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.steps[0].locator.strategy, 'testId');
  assert.equal(result.steps[0].verification.candidates[0].usable, false);
  assert.equal(result.steps[0].verification.candidates[1].usable, true);
  assert.equal(result.steps[0].stability.settled, true);
  assert.deepEqual(calls, [['click', 'continue-btn'], ['waitForLoadState', 'domcontentloaded'], ['waitForFunction']]);
});

test('runActions falls back when the primary locator probe throws', async () => {
  const primaryLocator = {
    async count() {
      return 1;
    },
    first() {
      return this;
    },
    async isVisible() {
      throw new Error('Element is detached');
    },
    async isEnabled() {
      throw new Error('Element is detached');
    },
  };
  const fallbackLocator = {
    async count() {
      return 1;
    },
    first() {
      return this;
    },
    async isVisible() {
      return true;
    },
    async isEnabled() {
      return true;
    },
    async click() {},
  };
  const page = {
    getByRole() {
      return primaryLocator;
    },
    getByTestId() {
      return fallbackLocator;
    },
    url() {
      return 'http://fixture.local/';
    },
    async title() {
      return 'Fixture';
    },
  };

  const result = await runActions(page, [
    {
      type: 'click',
      locator: { strategy: 'role', value: { role: 'button', name: 'Continue' } },
      fallbackLocators: [{ strategy: 'testId', value: 'continue-btn' }],
      stability: { after: 'none' },
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.steps[0].locator.strategy, 'testId');
  assert.match(result.steps[0].verification.candidates[0].message, /Element is detached/);
  assert.equal(result.steps[0].verification.candidates[0].usable, false);
});

test('runActions recovers intercepted checkbox checks by clicking the associated label and verifying checked state', async () => {
  const calls = [];
  let checked = false;
  const checkboxLocator = {
    async count() {
      return 1;
    },
    first() {
      return this;
    },
    async isVisible() {
      return true;
    },
    async isEnabled() {
      return true;
    },
    async check() {
      calls.push('check');
      throw new Error('span.checkbox-check intercepts pointer events');
    },
    async isChecked() {
      calls.push('isChecked');
      return checked;
    },
    async evaluate(callback, desiredChecked) {
      calls.push(['evaluate', desiredChecked]);
      checked = true;
      return callback(
        {
          checked,
          labels: [{ click() {} }],
          closest() {
            return null;
          },
        },
        desiredChecked
      );
    },
  };
  const page = {
    getByTestId() {
      return checkboxLocator;
    },
    url() {
      return 'http://fixture.local/preferences';
    },
    async title() {
      return 'Preferences';
    },
  };

  const result = await runActions(page, [
    {
      type: 'check',
      locator: { strategy: 'testId', value: 'share-progress' },
      stability: { after: 'none' },
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.steps[0].type, 'check');
  assert.equal(result.steps[0].checked, true);
  assert.deepEqual(calls, ['check', 'isChecked', ['evaluate', true], 'isChecked']);
});

test('runActions keeps intercepted checkbox checks failed when recovery cannot change the checked state', async () => {
  const calls = [];
  const checkboxLocator = {
    async count() {
      return 1;
    },
    first() {
      return this;
    },
    async isVisible() {
      return true;
    },
    async isEnabled() {
      return true;
    },
    async check() {
      calls.push('check');
      throw new Error('span.checkbox-check intercepts pointer events');
    },
    async isChecked() {
      calls.push('isChecked');
      return false;
    },
    async evaluate(callback, desiredChecked) {
      calls.push(['evaluate', desiredChecked]);
      return callback(
        {
          checked: false,
          labels: [],
          closest() {
            return null;
          },
        },
        desiredChecked
      );
    },
  };
  const page = {
    getByTestId() {
      return checkboxLocator;
    },
    url() {
      return 'http://fixture.local/preferences';
    },
    async title() {
      return 'Preferences';
    },
  };

  const result = await runActions(page, [
    {
      type: 'check',
      locator: { strategy: 'testId', value: 'share-progress' },
      stability: { after: 'none' },
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ACTION_STEP_FAILED');
  assert.match(result.error.message, /intercepts pointer events/);
  assert.deepEqual(calls, ['check', 'isChecked', ['evaluate', true], 'isChecked']);
});
