import { browserReadAssertionText } from './assertion-text.js';
import { browserWaitForStability } from './stability-wait.js';

function quote(value) {
  return `'${String(value ?? '').replace(/[\u0000-\u001f\\'\u2028\u2029]/g, (character) => {
    if (character === '\\') {
      return '\\\\';
    }
    if (character === "'") {
      return "\\'";
    }
    if (character === '\n') {
      return '\\n';
    }
    if (character === '\r') {
      return '\\r';
    }
    if (character === '\t') {
      return '\\t';
    }
    if (character === '\b') {
      return '\\b';
    }
    if (character === '\f') {
      return '\\f';
    }
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  })}'`;
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function locatorExpression(locator = {}) {
  if (locator.strategy === 'role') {
    return `page.getByRole(${quote(locator.value.role)}, { name: ${quote(locator.value.name)} })`;
  }

  if (locator.strategy === 'label') {
    return `page.getByLabel(${quote(locator.value)})`;
  }

  if (locator.strategy === 'text') {
    return `page.getByText(${quote(locator.value)}, { exact: true })`;
  }

  if (locator.strategy === 'placeholder') {
    return `page.getByPlaceholder(${quote(locator.value)})`;
  }

  if (locator.strategy === 'testId') {
    return `page.getByTestId(${quote(locator.value)})`;
  }

  return `page.locator(${quote(locator.value)})`;
}

function renderStability(step, index) {
  if (!step.stability?.settled) {
    return [];
  }

  const stabilityKey = `step-${index}-${step.type}-${step.locator?.strategy ?? 'page'}-${step.locator?.value?.role ?? step.locator?.value ?? 'none'}`;
  const predicateLines = browserWaitForStability.toString().split('\n');
  predicateLines[predicateLines.length - 1] = `${predicateLines[predicateLines.length - 1]},`;
  const waitForFunctionLines = [
    `await page.waitForFunction(`,
    ...predicateLines.map((line) => `  ${line}`),
    `  { settleMs: ${step.stability.settleMs ?? 120}, minObserveMs: ${step.stability.minObserveMs ?? 350}, stabilityKey: ${quote(stabilityKey)}, stateKey: '__agentBrowserCodegenStability' },`,
    `  { timeout: ${step.stability.timeoutMs ?? 1500}, polling: ${Math.min(100, step.stability.settleMs ?? 120)} }`,
    `);`,
  ];

  if (step.stability.trigger === 'url_change') {
    return [
      `await page.waitForLoadState('domcontentloaded', { timeout: ${Math.min(step.stability.timeoutMs ?? 1500, 800)} }).catch(() => {});`,
      ...waitForFunctionLines,
    ];
  }

  return waitForFunctionLines;
}

function renderRuntimeTextAssertion(locator, step) {
  const readerLines = browserReadAssertionText.toString().split('\n');
  return [
    `await expect.poll(async () => {`,
    `  const result = await ${locator}.evaluate(`,
    ...readerLines.map((line) => `    ${line}`),
    `  );`,
    `  return result.text;`,
    `}).toContain(${quote(step.value)});`,
  ];
}

function renderStep(step, index, warnings) {
  const locator = step.locator ? locatorExpression(step.locator) : null;

  if (step.type === 'fill') {
    return [`await expect(${locator}).toBeVisible();`, `await ${locator}.fill(${quote(step.value)});`, ...renderStability(step, index)];
  }

  if (step.type === 'click') {
    return [`await expect(${locator}).toBeVisible();`, `await ${locator}.click();`, ...renderStability(step, index)];
  }

  if (step.type === 'press') {
    return [`await expect(${locator}).toBeVisible();`, `await ${locator}.press(${quote(step.key)});`, ...renderStability(step, index)];
  }

  if (step.type === 'select') {
    return [
      `await expect(${locator}).toBeVisible();`,
      `await ${locator}.selectOption(${JSON.stringify(step.value)});`,
      ...renderStability(step, index),
    ];
  }

  if (step.type === 'check') {
    return [
      `await expect(${locator}).toBeVisible();`,
      `await ${locator}.${step.checked === false ? 'uncheck' : 'check'}();`,
      ...renderStability(step, index),
    ];
  }

  if (step.type === 'capture') {
    warnings.push({
      stepIndex: index,
      code: 'CAPTURE_OMITTED',
      message: 'Capture steps are omitted from generated automation by default',
    });
    return [];
  }

  if (step.type === 'wait_for') {
    warnings.push({
      stepIndex: index,
      code: 'WAIT_PRESERVED',
      message: 'Manual wait preserved because it was part of the validated flow',
    });
    return [`await page.waitForTimeout(${step.value});`];
  }

  if (step.type === 'assert_text') {
    return renderRuntimeTextAssertion(locator, step);
  }

  if (step.type === 'assert_url') {
    return [`await expect(page).toHaveURL(new RegExp(${quote(escapeRegex(step.value))}));`];
  }

  if (step.type === 'navigate') {
    const gotoOptions = step.waitUntil ? `, { waitUntil: ${quote(step.waitUntil)} }` : '';
    return [`await page.goto(${quote(step.url)}${gotoOptions});`, ...renderStability(step, index)];
  }

  return [];
}

export function generatePlaywrightTest({
  testName = 'generated flow',
  initialUrl,
  steps = [],
  includeImports = true,
  includeTestWrapper = true,
} = {}) {
  const warnings = [];
  const lines = steps.flatMap((step, index) => renderStep(step, index, warnings));
  const body = [];

  if (initialUrl) {
    body.push(`await page.goto(${quote(initialUrl)});`);
  }
  body.push(...lines);

  const content = includeTestWrapper
    ? [
        ...(includeImports ? [`import { test, expect } from '@playwright/test';`, ''] : []),
        `test(${quote(testName)}, async ({ page }) => {`,
        ...body.map((line) => `  ${line}`),
        `});`,
      ].join('\n')
    : body.join('\n');

  return {
    code: content,
    warnings,
  };
}
