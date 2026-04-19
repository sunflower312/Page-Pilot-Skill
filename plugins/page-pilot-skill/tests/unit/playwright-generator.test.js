import test from 'node:test';
import assert from 'node:assert/strict';

import { generatePlaywrightTest } from '../../scripts/lib/playwright-generator.js';

test('generatePlaywrightTest emits runnable TS from verified action trace', () => {
  const generated = generatePlaywrightTest({
    testName: 'generated workflow',
    initialUrl: 'http://fixture.local/structured-page.html',
    steps: [
      {
        type: 'fill',
        locator: { strategy: 'role', value: { role: 'textbox', name: 'Email' } },
        value: 'qa@example.com',
      },
      {
        type: 'click',
        locator: { strategy: 'testId', value: 'submit-button' },
        stability: { settled: true, trigger: 'dom_change', settleMs: 120, minObserveMs: 350, timeoutMs: 1500 },
      },
      {
        type: 'assert_text',
        locator: { strategy: 'css', value: '#message' },
        value: 'Thanks qa@example.com',
        assertionSource: 'textContent',
      },
      {
        type: 'assert_url',
        value: '/structured-page.html',
      },
    ],
  });
  const code = generated.code;

  assert.match(code, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(code, /test\('generated workflow'/);
  assert.match(code, /await page\.goto\('http:\/\/fixture\.local\/structured-page\.html'\);/);
  assert.match(code, /page\.getByRole\('textbox', \{ name: 'Email' \}\)\.fill\('qa@example.com'\)/);
  assert.match(code, /page\.getByTestId\('submit-button'\)\.click\(\)/);
  assert.match(code, /disabledCount:/);
  assert.match(code, /minObserveMs: 350/);
  assert.match(code, /stabilityKey:/);
  assert.match(code, /expect\.poll\(/);
  assert.match(code, /page\.locator\('#message'\)\.evaluate\(/);
  assert.match(code, /\.toContain\('Thanks qa@example\.com'\)/);
  assert.match(code, /expect\(page\)\.toHaveURL\(new RegExp/);
  assert.deepEqual(generated.warnings, []);
});

test('generatePlaywrightTest gives repeated actions distinct stability keys', () => {
  const { code } = generatePlaywrightTest({
    steps: [
      {
        type: 'click',
        locator: { strategy: 'css', value: '#go' },
        stability: { settled: true, trigger: 'dom_change', settleMs: 120, minObserveMs: 350, timeoutMs: 1500 },
      },
      {
        type: 'click',
        locator: { strategy: 'css', value: '#go' },
        stability: { settled: true, trigger: 'dom_change', settleMs: 120, minObserveMs: 350, timeoutMs: 1500 },
      },
    ],
  });

  assert.match(code, /stabilityKey: 'step-0-click-css-#go'/);
  assert.match(code, /stabilityKey: 'step-1-click-css-#go'/);
});

test('generatePlaywrightTest preserves non-default waitUntil on navigate steps', () => {
  const { code } = generatePlaywrightTest({
    steps: [
      {
        type: 'navigate',
        url: 'http://fixture.local/streaming',
        waitUntil: 'commit',
        stability: { settled: true, trigger: 'url_change', settleMs: 150, minObserveMs: 360, timeoutMs: 1900 },
      },
    ],
  });

  assert.match(code, /await page\.goto\('http:\/\/fixture\.local\/streaming', \{ waitUntil: 'commit' \}\);/);
  assert.match(code, /await page\.waitForFunction\(/);
  assert.match(code, /minObserveMs: 360/);
});

test('generatePlaywrightTest preserves settle wait after url-changing steps', () => {
  const { code } = generatePlaywrightTest({
    steps: [
      {
        type: 'click',
        locator: { strategy: 'text', value: 'Continue' },
        stability: { settled: true, trigger: 'url_change', settleMs: 180, minObserveMs: 420, timeoutMs: 2100 },
      },
    ],
  });

  assert.match(code, /await page\.waitForLoadState\('domcontentloaded', \{ timeout: 800 \}\)\.catch\(\(\) => \{\}\);/);
  assert.match(code, /await page\.waitForFunction\(/);
  assert.match(code, /minObserveMs: 420/);
  assert.match(code, /timeout: 2100/);
});

test('generatePlaywrightTest bounds domcontentloaded wait by stability timeout for url-changing steps', () => {
  const { code } = generatePlaywrightTest({
    steps: [
      {
        type: 'navigate',
        url: 'http://fixture.local/fast-transition',
        waitUntil: 'commit',
        stability: { settled: true, trigger: 'url_change', settleMs: 120, minObserveMs: 300, timeoutMs: 500 },
      },
    ],
  });

  assert.match(code, /await page\.waitForLoadState\('domcontentloaded', \{ timeout: 500 \}\)\.catch\(\(\) => \{\}\);/);
});

test('generatePlaywrightTest escapes multiline string literals in generated code', () => {
  const { code } = generatePlaywrightTest({
    steps: [
      {
        type: 'fill',
        locator: { strategy: 'css', value: '#notes' },
        value: 'line 1\nline 2',
      },
      {
        type: 'assert_text',
        locator: { strategy: 'css', value: '#notes' },
        value: 'line 1\nline 2',
        assertionSource: 'textContent',
      },
    ],
  });

  assert.match(code, /fill\((['"])line 1\\nline 2\1\)/);
  assert.match(code, /\.toContain\((['"])line 1\\nline 2\1\)/);
});

test('generatePlaywrightTest preserves containment semantics for form control assertions', () => {
  const { code } = generatePlaywrightTest({
    steps: [
      {
        type: 'assert_text',
        locator: { strategy: 'css', value: '#email' },
        value: 'example.com',
        assertionSource: 'value',
      },
      {
        type: 'assert_text',
        locator: { strategy: 'css', value: '#topics' },
        value: 'High Needs',
        assertionSource: 'selectedText',
      },
    ],
  });

  assert.match(code, /expect\.poll\(/);
  assert.match(code, /\.toContain\((['"])example\.com\1\)/);
  assert.match(code, /\.toContain\((['"])High Needs\1\)/);
  assert.doesNotMatch(code, /toHaveValue\(/);
  assert.doesNotMatch(code, /toHaveText\(/);
});

test('generatePlaywrightTest reuses runtime text reader for textContent assertions', () => {
  const { code } = generatePlaywrightTest({
    steps: [
      {
        type: 'assert_text',
        locator: { strategy: 'css', value: '#status' },
        value: 'READY\nFOR NEXT STEP',
        assertionSource: 'textContent',
      },
    ],
  });

  assert.match(code, /expect\.poll\(/);
  assert.match(code, /return result\.text;/);
  assert.match(code, /\.toContain\((['"])READY\\nFOR NEXT STEP\1\)/);
  assert.doesNotMatch(code, /toContainText\(/);
});
