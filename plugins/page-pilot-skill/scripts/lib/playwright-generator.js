import {
  collectRuntimeTokens,
  hasRuntimeTokens,
  parameterizeValidatedSteps,
  parseOptionToken,
  runtimeTokenCodeExpression,
} from './runtime-parameters.js';
import { toPlaywrightExpression } from './playwright-locator-expression.js';

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

function renderStability(step, index) {
  if (!step.stability?.settled) {
    return [];
  }

  const locator = step.locatorChoice ?? step.locator ?? {};
  if (step.stability.trigger === 'url_change') {
    return [`await page.waitForLoadState('domcontentloaded', { timeout: ${Math.min(step.stability.timeoutMs ?? 1500, 800)} }).catch(() => {});`];
  }

  return [`await page.waitForTimeout(${Math.max(step.stability.settleMs ?? 120, 50)});`];
}

function renderRuntimeTextAssertion(locator, step) {
  return [
    `await expect.poll(async () => {`,
    `  return await readAssertionText(${locator});`,
    `}).toContain(${renderValueExpression(step.value)});`,
  ];
}

function escapeTemplateSegment(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function renderTemplateLiteral(value) {
  const tokens = collectRuntimeTokens(value);
  if (
    tokens.length === 1 &&
    value.trim() === tokens[0].token
  ) {
    return runtimeTokenCodeExpression(tokens[0]);
  }

  let cursor = 0;
  let template = '';
  for (const token of tokens) {
    const tokenIndex = value.indexOf(token.token, cursor);
    template += escapeTemplateSegment(value.slice(cursor, tokenIndex));
    template += `\${${runtimeTokenCodeExpression(token)}}`;
    cursor = tokenIndex + token.token.length;
  }
  template += escapeTemplateSegment(value.slice(cursor));
  return `\`${template}\``;
}

function renderValueExpression(value) {
  if (Array.isArray(value)) {
    if (value.some((entry) => hasRuntimeTokens(entry))) {
      return `[${value.map((entry) => renderValueExpression(entry)).join(', ')}]`;
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'string' && hasRuntimeTokens(value)) {
    return renderTemplateLiteral(value);
  }

  return quote(value);
}

function renderSingleSelectOptionExpression(locator, value) {
  const optionToken = parseOptionToken(value);
  if (optionToken) {
    return `await pagePilot.optionValue(${locator}, ${quote(optionToken.position)})`;
  }

  return renderValueExpression(value);
}

function renderSelectOptionExpression(locator, value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => renderSingleSelectOptionExpression(locator, entry)).join(', ')}]`;
  }

  return renderSingleSelectOptionExpression(locator, value);
}

function usesDynamicSelectOption(step = {}) {
  if (step.type !== 'select') {
    return false;
  }
  if (Array.isArray(step.value)) {
    return step.value.some((entry) => parseOptionToken(entry));
  }
  return Boolean(parseOptionToken(step.value));
}

function buildLocatorChoice(step = {}) {
  const rankedLocator = step.locatorRanking?.[0]?.preferredLocator ?? null;
  const verifiedLocator =
    step.codegenVerification?.unique === true && step.codegenVerification?.usable === true
      ? step.codegenVerification?.locator ?? step.locatorChoice ?? step.locator ?? null
      : null;
  const locatorChoice = verifiedLocator ?? rankedLocator ?? step.locatorChoice ?? step.locator ?? null;
  return {
    stepType: step.type,
    locator: locatorChoice,
    fallbackLocators: [
      ...(step.fallbackLocatorChoices ?? step.fallbackLocators ?? []),
      ...(verifiedLocator && JSON.stringify(verifiedLocator) !== JSON.stringify(locatorChoice)
        ? [verifiedLocator]
        : []),
      ...(step.locatorChoice && JSON.stringify(step.locatorChoice) !== JSON.stringify(locatorChoice)
        ? [step.locatorChoice]
        : []),
      ...(rankedLocator && JSON.stringify(rankedLocator) !== JSON.stringify(locatorChoice)
        ? [rankedLocator]
        : []),
    ],
    rankingReasons: step.locatorRanking?.[0]?.reasons ?? [],
    confidence: step.confidence ?? null,
    semanticTarget: step.semanticTarget ?? null,
    stableFingerprint: step.stableFingerprint ?? null,
    verification: step.codegenVerification ?? null,
    expectedStateChange: step.expectedStateChange ?? null,
  };
}

function appendLocatorWarnings(locatorChoices = [], warnings = []) {
  locatorChoices.forEach((choice, index) => {
    if (choice.locator?.strategy === 'css') {
      warnings.push({
        stepIndex: index,
        code: 'CSS_FALLBACK_USED',
        message: 'Generated code fell back to a CSS locator because no stronger semantic locator was verified',
      });
    }

    if (choice.verification && (choice.verification.unique !== true || choice.verification.usable !== true)) {
      warnings.push({
        stepIndex: index,
        code: 'LOCATOR_NOT_FULLY_VERIFIED',
        message: 'Generated locator did not have a unique verified match in the captured validation evidence',
      });
    }
  });
}

function normalizeValidationEvidence({ validationEvidence, validatedSteps }) {
  if (validationEvidence?.steps) {
    return validationEvidence.steps;
  }
  return validatedSteps;
}

function sanitizeLocator(locator = null) {
  if (!locator || typeof locator !== 'object') {
    return null;
  }

  if (locator.locator && typeof locator.locator === 'object') {
    return sanitizeLocator(locator.locator);
  }

  if (!locator.strategy || locator.value === undefined) {
    return null;
  }

  return {
    strategy: locator.strategy,
    value:
      locator.strategy === 'role'
        ? {
            ...locator.value,
            exact: locator.value?.exact !== false,
          }
        : locator.value,
  };
}

function sanitizeStability(stability = null) {
  if (!stability || typeof stability !== 'object') {
    return null;
  }

  const sanitized = {};
  if (stability.after === 'auto' || stability.after === 'none') {
    sanitized.after = stability.after;
  }
  if (Number.isInteger(stability.timeoutMs) && stability.timeoutMs > 0) {
    sanitized.timeoutMs = stability.timeoutMs;
  }
  if (Number.isInteger(stability.settleMs) && stability.settleMs > 0) {
    sanitized.settleMs = stability.settleMs;
  }
  if (Number.isInteger(stability.minObserveMs) && stability.minObserveMs > 0) {
    sanitized.minObserveMs = stability.minObserveMs;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function buildGeneratedPlan(startUrl, steps = []) {
  const plan = [];
  if (startUrl) {
    plan.push({
      type: 'navigate',
      url: startUrl,
    });
  }

  for (const step of steps) {
    if (step.type === 'capture') {
      continue;
    }

    const locatorChoice = sanitizeLocator(step.locatorChoice ?? step.locator ?? step.locatorRanking?.[0]?.preferredLocator ?? null);
    const nextStep = {
      type: step.type,
    };

    if (locatorChoice) {
      nextStep.locator = locatorChoice;
      const fallbackLocators = (step.fallbackLocatorChoices ?? step.fallbackLocators ?? [])
        .map((locator) => sanitizeLocator(locator))
        .filter(Boolean);
      if (fallbackLocators.length > 0) {
        nextStep.fallbackLocators = fallbackLocators;
      }
    }

    if (step.expectedStateChange && typeof step.expectedStateChange === 'object') {
      nextStep.expectedStateChange = step.expectedStateChange;
    }

    if (step.type === 'fill' || step.type === 'select' || step.type === 'wait_for' || step.type === 'assert_text' || step.type === 'assert_url') {
      nextStep.value = step.value;
    }
    if (step.type === 'press') {
      nextStep.value = step.key ?? step.value;
    }
    if (step.type === 'check' && step.checked === false) {
      nextStep.checked = false;
    }
    if (step.type === 'navigate' && step.url) {
      nextStep.url = step.url;
      if (step.waitUntil) {
        nextStep.waitUntil = step.waitUntil;
      }
    }
    const stability = sanitizeStability(step.stability);
    if (stability) {
      nextStep.stability = stability;
    }

    plan.push(nextStep);
  }

  return plan;
}

function renderStep(step, index, warnings) {
  const locatorRef = step.locatorChoice ?? step.locator;
  const locator = locatorRef ? toPlaywrightExpression(locatorRef, { quote }) : null;

  if (step.type === 'fill') {
    return [`await expect(${locator}).toBeVisible();`, `await ${locator}.fill(${renderValueExpression(step.value)});`, ...renderStability(step, index)];
  }

  if (step.type === 'click') {
    return [`await expect(${locator}).toBeVisible();`, `await ${locator}.click();`, ...renderStability(step, index)];
  }

  if (step.type === 'press') {
    return [`await expect(${locator}).toBeVisible();`, `await ${locator}.press(${renderValueExpression(step.key ?? step.value)});`, ...renderStability(step, index)];
  }

  if (step.type === 'select') {
    return [
      `await expect(${locator}).toBeVisible();`,
      `await ${locator}.selectOption(${renderSelectOptionExpression(locator, step.value)});`,
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
    return [`await expect.poll(async () => page.url()).toContain(${renderValueExpression(step.value)});`];
  }

  if (step.type === 'navigate') {
    const gotoOptions = step.waitUntil ? `, { waitUntil: ${quote(step.waitUntil)} }` : '';
    return [`await page.goto(${renderValueExpression(step.url)}${gotoOptions});`, ...renderStability(step, index)];
  }

  return [];
}

export function generatePlaywrightTest({
  testName = 'generated flow',
  startUrl,
  validationEvidence = null,
  validatedSteps = [],
  includeImports = true,
  includeTestWrapper = true,
} = {}) {
  const warnings = [];
  const originalSteps = normalizeValidationEvidence({ validationEvidence, validatedSteps });
  const { steps: parameterizedSteps, runtimeTokens } = parameterizeValidatedSteps(originalSteps);
  const effectiveSteps = parameterizedSteps.map((step) => {
    const choice = buildLocatorChoice(step);
    return {
      ...step,
      locatorChoice: choice.locator,
      fallbackLocatorChoices: choice.fallbackLocators,
    };
  });
  const lines = effectiveSteps.flatMap((step, index) => renderStep(step, index, warnings));
  const locatorChoices = effectiveSteps
    .filter((step) => step.locatorChoice || step.locator || step.locatorRanking?.[0]?.preferredLocator)
    .map((step) => buildLocatorChoice(step));
  appendLocatorWarnings(locatorChoices, warnings);
  const fallbackLocatorChoices = locatorChoices.map((choice) => choice.fallbackLocators ?? []);
  const assertionPlan = effectiveSteps.map((step) => step.assertionPlan).filter(Boolean);
  const expectedStateChanges = effectiveSteps.map((step) => step.expectedStateChange).filter(Boolean);
  const body = [];
  const needsAssertionTextHelper = effectiveSteps.some((step) => step.type === 'assert_text');
  const needsRuntimeHelper = runtimeTokens.length > 0 || effectiveSteps.some((step) => usesDynamicSelectOption(step));
  const generatedPlan = buildGeneratedPlan(startUrl, effectiveSteps);

  if (startUrl) {
    body.push(`await page.goto(${quote(startUrl)});`);
  }
  if (needsRuntimeHelper) {
    body.push(`const pagePilot = createPagePilotRuntime();`);
  }
  body.push(...lines);

  const helperLines = [
    ...(needsAssertionTextHelper
      ? [
          `async function readAssertionText(locator) {`,
          `  return await locator.evaluate((element) => {`,
          `    const tagName = element?.tagName?.toLowerCase?.() ?? '';`,
          `    if (tagName === 'input' || tagName === 'textarea') return element.value ?? '';`,
          `    if (tagName === 'select') {`,
          `      return Array.from(element.selectedOptions ?? []).map((option) => option.label || option.textContent || option.value || '').join(' ').trim();`,
          `    }`,
          `    return element?.textContent ?? '';`,
          `  });`,
          `}`,
          '',
        ]
      : []),
    ...(needsRuntimeHelper
      ? [
          `function createPagePilotRuntime() {`,
          `  const cache = new Map();`,
          `  const stable = (key, builder) => {`,
          `    if (!cache.has(key)) cache.set(key, builder());`,
          `    return cache.get(key);`,
          `  };`,
          `  const nonce = () => \`\${Math.random().toString(36).slice(2, 8)}\${Date.now().toString(36).slice(-4)}\`;`,
          `  return {`,
          `    uniqueId(label = 'default') {`,
          `      return stable(\`uniqueId:\${label}\`, () => \`pp\${nonce()}\`);`,
          `    },`,
          `    uniqueUsername(label = 'default') {`,
          `      return stable(\`uniqueUsername:\${label}\`, () => \`pp\${nonce()}\`);`,
          `    },`,
          `    uniqueEmail(label = 'default') {`,
          `      return stable(\`uniqueEmail:\${label}\`, () => \`pp\${nonce()}@example.test\`);`,
          `    },`,
          `    async optionValue(locator, position = 'first') {`,
          `      return await locator.evaluate((element, requestedPosition) => {`,
          `        const options = Array.from(element?.options ?? []);`,
          `        if (options.length === 0) throw new Error('Select element has no options to choose from');`,
          `        const option = requestedPosition === 'last' ? options[options.length - 1] : options[0];`,
          `        return option.value || option.label || option.textContent || '';`,
          `      }, position);`,
          `    },`,
          `  };`,
          `}`,
          '',
        ]
      : []),
  ];

  const content = includeTestWrapper
    ? [
        ...(includeImports ? [`import { test, expect } from '@playwright/test';`, ''] : []),
        ...helperLines,
        `test(${quote(testName)}, async ({ page }) => {`,
        ...body.map((line) => `  ${line}`),
        `});`,
      ].join('\n')
    : [...helperLines, ...body].join('\n');

  const semanticLocatorCount = locatorChoices.filter((choice) => choice.locator?.strategy !== 'css').length;
  const cssFallbackCount = locatorChoices.filter((choice) => choice.locator?.strategy === 'css').length;
  const metrics = {
    locatorCount: locatorChoices.length,
    semanticLocatorRatio: locatorChoices.length === 0 ? 1 : Number((semanticLocatorCount / locatorChoices.length).toFixed(2)),
    cssFallbackRatio: locatorChoices.length === 0 ? 0 : Number((cssFallbackCount / locatorChoices.length).toFixed(2)),
    assertionCount: assertionPlan.length,
    codeLineCount: content.split('\n').length,
  };

  return {
    code: content,
    warnings,
    locatorChoices,
    fallbackLocatorChoices,
    expectedStateChanges,
    assertionPlan,
    generatedPlan,
    metrics,
  };
}
