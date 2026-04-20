import test from 'node:test';
import assert from 'node:assert/strict';

import { generatePlaywrightTest } from '../../scripts/lib/playwright-generator.js';

test('generatePlaywrightTest emits runnable TS from verified action trace', () => {
  const generated = generatePlaywrightTest({
    testName: 'generated workflow',
    startUrl: 'http://fixture.local/structured-page.html',
    validationEvidence: {
      steps: [
        {
          type: 'fill',
          locatorChoice: { strategy: 'role', value: { role: 'textbox', name: 'Email' } },
          locatorRanking: [{ preferredLocator: { strategy: 'role', value: { role: 'textbox', name: 'Email' } }, reasons: ['semantic_role_name'] }],
          semanticTarget: { role: 'textbox', accessibleName: 'Email' },
          codegenVerification: { unique: true, usable: true, count: 1 },
          value: 'qa@example.com',
        },
        {
          type: 'click',
          locatorChoice: { strategy: 'role', value: { role: 'button', name: 'Submit' } },
          locatorRanking: [{ preferredLocator: { strategy: 'role', value: { role: 'button', name: 'Submit' } }, reasons: ['visible_text_exact_match'] }],
          semanticTarget: { role: 'button', accessibleName: 'Submit' },
          codegenVerification: { unique: true, usable: true, count: 1 },
          expectedStateChange: { kind: 'dom_change', textIncludes: 'Thanks qa@example.com' },
          stability: { settled: true, trigger: 'dom_change', settleMs: 120, minObserveMs: 350, timeoutMs: 1500 },
        },
        {
          type: 'assert_text',
          locatorChoice: { strategy: 'css', value: '#message' },
          value: 'Thanks qa@example.com',
          assertionPlan: { kind: 'text_contains', expected: 'Thanks qa@example.com', source: 'textContent' },
        },
        {
          type: 'assert_url',
          value: '/structured-page.html',
          assertionPlan: { kind: 'url_contains', expected: '/structured-page.html' },
        },
      ],
    },
  });
  const code = generated.code;

  assert.match(code, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(code, /test\('generated workflow'/);
  assert.match(code, /await page\.goto\('http:\/\/fixture\.local\/structured-page\.html'\);/);
  assert.doesNotMatch(code, /createPagePilotRuntime/);
  assert.match(code, /page\.getByRole\('textbox', \{ name: 'Email', exact: true \}\)\.fill\('qa@example\.com'\)/);
  assert.match(code, /page\.getByRole\('button', \{ name: 'Submit', exact: true \}\)\.click\(\)/);
  assert.match(code, /page\.waitForTimeout\(120\)/);
  assert.match(code, /expect\.poll\(/);
  assert.match(code, /readAssertionText\(page\.locator\('#message'\)\)/);
  assert.match(code, /\.toContain\('Thanks qa@example\.com'\)/);
  assert.match(code, /expect\.poll\(async \(\) => page\.url\(\)\)\.toContain\('\/structured-page\.html'\);/);
  assert.deepEqual(generated.warnings, []);
  assert.equal(generated.metrics.semanticLocatorRatio, 0.67);
  assert.equal(generated.locatorChoices[0].locator.strategy, 'role');
  assert.equal(generated.assertionPlan.length, 2);
  assert.equal(generated.expectedStateChanges[0].kind, 'dom_change');
  assert.equal(generated.generatedPlan[0].type, 'navigate');
});

test('generatePlaywrightTest emits a MCP-valid generatedPlan shape', () => {
  const generated = generatePlaywrightTest({
    testName: 'generated-plan-shape',
    startUrl: 'https://example.com/start',
    validationEvidence: {
      steps: [
        {
          type: 'click',
          locatorChoice: { strategy: 'role', value: { role: 'button', name: 'Next' } },
          fallbackLocatorChoices: [
            {
              locator: { strategy: 'text', value: 'Next' },
              score: 80,
              playwrightExpression: "page.getByText('Next', { exact: true })",
            },
            {
              strategy: 'css',
              value: '.next-button',
            },
          ],
          expectedStateChange: null,
          stability: {
            settled: true,
            trigger: 'url_change',
            settleMs: 120,
            minObserveMs: 360,
            timeoutMs: 1500,
          },
        },
      ],
    },
  });

  assert.deepEqual(generated.generatedPlan, [
    {
      type: 'navigate',
      url: 'https://example.com/start',
    },
    {
      type: 'click',
      locator: { strategy: 'role', value: { role: 'button', name: 'Next', exact: true } },
      fallbackLocators: [
        { strategy: 'text', value: 'Next' },
        { strategy: 'css', value: '.next-button' },
      ],
      stability: {
        settleMs: 120,
        minObserveMs: 360,
        timeoutMs: 1500,
      },
    },
  ]);
});

test('generatePlaywrightTest emits short repeated stability waits without duplicating helpers', () => {
  const { code } = generatePlaywrightTest({
    validationEvidence: { steps: [
      {
        type: 'click',
        locatorChoice: { strategy: 'css', value: '#go' },
        stability: { settled: true, trigger: 'dom_change', settleMs: 120, minObserveMs: 350, timeoutMs: 1500 },
      },
      {
        type: 'click',
        locatorChoice: { strategy: 'css', value: '#go' },
        stability: { settled: true, trigger: 'dom_change', settleMs: 120, minObserveMs: 350, timeoutMs: 1500 },
      },
    ]},
  });

  assert.match(code, /await page\.waitForTimeout\(120\);/);
  assert.equal((code.match(/await page\.waitForTimeout\(120\);/g) ?? []).length, 2);
});

test('generatePlaywrightTest preserves non-default waitUntil on navigate steps', () => {
  const { code } = generatePlaywrightTest({
    validationEvidence: { steps: [
      {
        type: 'navigate',
        url: 'http://fixture.local/streaming',
        waitUntil: 'commit',
        stability: { settled: true, trigger: 'url_change', settleMs: 150, minObserveMs: 360, timeoutMs: 1900 },
      },
    ]},
  });

  assert.match(code, /await page\.goto\('http:\/\/fixture\.local\/streaming', \{ waitUntil: 'commit' \}\);/);
  assert.match(code, /await page\.waitForLoadState\('domcontentloaded', \{ timeout: 800 \}\)\.catch\(\(\) => \{\}\);/);
});

test('generatePlaywrightTest emits executable helper code when wrapper is disabled', () => {
  const { code } = generatePlaywrightTest({
    includeImports: false,
    includeTestWrapper: false,
    validationEvidence: {
      steps: [
        {
          type: 'fill',
          locatorChoice: { strategy: 'role', value: { role: 'textbox', name: 'Email' } },
          semanticTarget: { role: 'textbox', accessibleName: 'Email', attributes: { label: 'Email' } },
          value: 'qa@example.com',
        },
        {
          type: 'assert_text',
          locatorChoice: { strategy: 'css', value: '#status' },
          value: 'Created qa@example.com',
          assertionPlan: { kind: 'text_contains', expected: 'Created qa@example.com', source: 'textContent' },
        },
      ],
    },
  });

  assert.doesNotMatch(code, /import \{ test, expect \}/);
  assert.doesNotMatch(code, /test\(/);
  assert.doesNotMatch(code, /function createPagePilotRuntime\(\)/);
  assert.match(code, /async function readAssertionText\(locator\)/);
  assert.doesNotMatch(code, /const pagePilot = createPagePilotRuntime\(\);/);
});

test('generatePlaywrightTest preserves settle wait after url-changing steps', () => {
  const { code } = generatePlaywrightTest({
    validationEvidence: { steps: [
      {
        type: 'click',
        locatorChoice: { strategy: 'text', value: 'Continue' },
        stability: { settled: true, trigger: 'url_change', settleMs: 180, minObserveMs: 420, timeoutMs: 2100 },
      },
    ]},
  });

  assert.match(code, /await page\.waitForLoadState\('domcontentloaded', \{ timeout: 800 \}\)\.catch\(\(\) => \{\}\);/);
  assert.match(code, /await page\.waitForLoadState\('domcontentloaded', \{ timeout: 800 \}\)\.catch\(\(\) => \{\}\);/);
});

test('generatePlaywrightTest bounds domcontentloaded wait by stability timeout for url-changing steps', () => {
  const { code } = generatePlaywrightTest({
    validationEvidence: { steps: [
      {
        type: 'navigate',
        url: 'http://fixture.local/fast-transition',
        waitUntil: 'commit',
        stability: { settled: true, trigger: 'url_change', settleMs: 120, minObserveMs: 300, timeoutMs: 500 },
      },
    ]},
  });

  assert.match(code, /await page\.waitForLoadState\('domcontentloaded', \{ timeout: 500 \}\)\.catch\(\(\) => \{\}\);/);
});

test('generatePlaywrightTest escapes multiline string literals in generated code', () => {
  const { code } = generatePlaywrightTest({
    validationEvidence: { steps: [
      {
        type: 'fill',
        locatorChoice: { strategy: 'css', value: '#notes' },
        value: 'line 1\nline 2',
      },
      {
        type: 'assert_text',
        locatorChoice: { strategy: 'css', value: '#notes' },
        value: 'line 1\nline 2',
        assertionPlan: { kind: 'text_contains', expected: 'line 1\nline 2', source: 'textContent' },
      },
    ]},
  });

  assert.match(code, /fill\((['"])line 1\\nline 2\1\)/);
  assert.match(code, /\.toContain\((['"])line 1\\nline 2\1\)/);
});

test('generatePlaywrightTest keeps literal validated values unless runtime tokens are explicit', () => {
  const generated = generatePlaywrightTest({
    validationEvidence: {
      steps: [
        {
          type: 'fill',
          locatorChoice: { strategy: 'role', value: { role: 'textbox', name: 'Username' } },
          semanticTarget: {
            role: 'textbox',
            accessibleName: 'Username',
            visibleText: 'Username',
            attributes: { label: 'Username' },
          },
          value: 'bench-user-001',
        },
        {
          type: 'fill',
          locatorChoice: { strategy: 'role', value: { role: 'textbox', name: 'Email' } },
          semanticTarget: {
            role: 'textbox',
            accessibleName: 'Email',
            visibleText: 'Email',
            attributes: { label: 'Email' },
          },
          value: 'bench001@example.com',
        },
        {
          type: 'assert_text',
          locatorChoice: { strategy: 'css', value: '#status' },
          value: 'Created bench-user-001 for bench001@example.com',
          assertionPlan: {
            kind: 'text_contains',
            expected: 'Created bench-user-001 for bench001@example.com',
            source: 'textContent',
          },
        },
      ],
    },
  });

  assert.doesNotMatch(generated.code, /function createPagePilotRuntime\(\)/);
  assert.match(generated.code, /\.fill\('bench-user-001'\)/);
  assert.match(generated.code, /\.fill\('bench001@example\.com'\)/);
  assert.match(
    generated.code,
    /\.toContain\('Created bench-user-001 for bench001@example\.com'\)/
  );
  assert.equal(generated.generatedPlan[0].value, 'bench-user-001');
  assert.equal(generated.generatedPlan[1].value, 'bench001@example.com');
  assert.equal(generated.generatedPlan[2].value, 'Created bench-user-001 for bench001@example.com');
});

test('generatePlaywrightTest prefers the Playwright-verified locator over higher-level semantic guesses', () => {
  const generated = generatePlaywrightTest({
    validationEvidence: {
      steps: [
        {
          type: 'fill',
          locator: { strategy: 'css', value: '#customer\\.firstName' },
          locatorChoice: { strategy: 'role', value: { role: 'textbox', name: 'First Name:' } },
          codegenVerification: {
            locator: { strategy: 'css', value: '#customer\\.firstName' },
            unique: true,
            usable: true,
            count: 1,
          },
          locatorRanking: [
            {
              preferredLocator: { strategy: 'role', value: { role: 'textbox', name: 'First Name:' } },
              reasons: ['semantic_role_name'],
            },
          ],
          value: 'Bench',
        },
      ],
    },
  });

  assert.match(generated.code, /page\.locator\('#customer\\\\\.firstName'\)\.fill\('Bench'\)/);
  assert.equal(generated.locatorChoices[0].locator.strategy, 'css');
  assert.equal(generated.generatedPlan[0].locator.strategy, 'css');
});

test('generatePlaywrightTest emits dynamic select option helpers for option position tokens', () => {
  const generated = generatePlaywrightTest({
    validationEvidence: {
      steps: [
        {
          type: 'select',
          locatorChoice: { strategy: 'css', value: '#fromAccountId' },
          value: '{{pagePilot.option:first}}',
        },
        {
          type: 'select',
          locatorChoice: { strategy: 'css', value: '#toAccountId' },
          value: '{{pagePilot.option:last}}',
        },
      ],
    },
  });

  assert.match(generated.code, /async optionValue\(locator, position = 'first'\)/);
  assert.match(generated.code, /page\.locator\('#fromAccountId'\)\.selectOption\(await pagePilot\.optionValue\(page\.locator\('#fromAccountId'\), 'first'\)\)/);
  assert.match(generated.code, /page\.locator\('#toAccountId'\)\.selectOption\(await pagePilot\.optionValue\(page\.locator\('#toAccountId'\), 'last'\)\)/);
});

test('generatePlaywrightTest emits dynamic select option helpers for option position token arrays', () => {
  const generated = generatePlaywrightTest({
    validationEvidence: {
      steps: [
        {
          type: 'select',
          locatorChoice: { strategy: 'css', value: '#accountIds' },
          value: ['{{pagePilot.option:first}}', '{{pagePilot.option:last}}'],
        },
      ],
    },
  });

  assert.match(
    generated.code,
    /page\.locator\('#accountIds'\)\.selectOption\(\[await pagePilot\.optionValue\(page\.locator\('#accountIds'\), 'first'\), await pagePilot\.optionValue\(page\.locator\('#accountIds'\), 'last'\)\]\)/
  );
});

test('generatePlaywrightTest parameterizes navigate and assert_url runtime tokens consistently', () => {
  const generated = generatePlaywrightTest({
    validationEvidence: {
      steps: [
        {
          type: 'navigate',
          url: 'https://example.test/session/{{pagePilot.uniqueId}}',
          waitUntil: 'commit',
        },
        {
          type: 'assert_url',
          value: '/session/{{pagePilot.uniqueId}}',
          assertionPlan: { kind: 'url_contains', expected: '/session/{{pagePilot.uniqueId}}' },
        },
      ],
    },
  });

  assert.match(generated.code, /await page\.goto\(`https:\/\/example\.test\/session\/\$\{pagePilot\.uniqueId\("default"\)\}`/);
  assert.match(generated.code, /expect\.poll\(async \(\) => page\.url\(\)\)\.toContain\(`\/session\/\$\{pagePilot\.uniqueId\("default"\)\}`\);/);
  assert.equal(generated.generatedPlan[0].url, 'https://example.test/session/{{pagePilot.uniqueId}}');
});

test('generatePlaywrightTest preserves containment semantics for form control assertions', () => {
  const { code } = generatePlaywrightTest({
    validationEvidence: { steps: [
      {
        type: 'assert_text',
        locatorChoice: { strategy: 'css', value: '#email' },
        value: 'example.com',
        assertionPlan: { kind: 'text_contains', expected: 'example.com', source: 'value' },
      },
      {
        type: 'assert_text',
        locatorChoice: { strategy: 'css', value: '#topics' },
        value: 'High Needs',
        assertionPlan: { kind: 'text_contains', expected: 'High Needs', source: 'selectedText' },
      },
    ]},
  });

  assert.match(code, /expect\.poll\(/);
  assert.match(code, /\.toContain\((['"])example\.com\1\)/);
  assert.match(code, /\.toContain\((['"])High Needs\1\)/);
  assert.doesNotMatch(code, /toHaveValue\(/);
  assert.doesNotMatch(code, /toHaveText\(/);
});

test('generatePlaywrightTest reuses runtime text reader for textContent assertions', () => {
  const { code } = generatePlaywrightTest({
    validationEvidence: { steps: [
      {
        type: 'assert_text',
        locatorChoice: { strategy: 'css', value: '#status' },
        value: 'READY\nFOR NEXT STEP',
        assertionPlan: { kind: 'text_contains', expected: 'READY\nFOR NEXT STEP', source: 'textContent' },
      },
    ]},
  });

  assert.match(code, /expect\.poll\(/);
  assert.match(code, /return await readAssertionText\(page\.locator\('#status'\)\);/);
  assert.match(code, /\.toContain\((['"])READY\\nFOR NEXT STEP\1\)/);
  assert.doesNotMatch(code, /toContainText\(/);
});
