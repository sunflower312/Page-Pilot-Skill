import { toPlaywrightExpression } from './playwright-locator-expression.js';

function buildSignalScore(strategy, value, element = {}) {
  const confidenceBoost = Math.round((element.confidence?.score ?? 0) * 10);
  const contextBoost = (element.withinDialog ? 2 : 0) + (element.withinForm ? 2 : 0);
  const nameSource = element.provenance?.nameSource ?? element.nameSource ?? 'none';
  const labelSource = element.provenance?.labelSource ?? element.labelSource ?? 'none';
  const strongNameSource = [
    'aria-label',
    'aria-labelledby',
    'label',
    'wrapped-label',
    'inner-text',
    'table-row',
  ].includes(nameSource);
  const placeholderPenalty = nameSource === 'placeholder' ? -8 : 0;
  const strongLabelBoost = ['label', 'wrapped-label', 'aria-labelledby', 'table-row'].includes(labelSource) ? 4 : 0;

  if (strategy === 'role') {
    const hasExactName = Boolean(value?.name);
    return (hasExactName ? 86 : 68) + confidenceBoost + contextBoost + (strongNameSource ? 6 : 0) + placeholderPenalty;
  }

  if (strategy === 'label') {
    return 84 + confidenceBoost + contextBoost + strongLabelBoost;
  }

  if (strategy === 'testId') {
    const semanticFallbackPenalty = element.role && (element.accessibleName || element.name || element.label) ? -2 : 8;
    return 82 + confidenceBoost + semanticFallbackPenalty;
  }

  if (strategy === 'text') {
    return 72 + confidenceBoost + contextBoost;
  }

  if (strategy === 'placeholder') {
    return 60 + confidenceBoost + contextBoost + (nameSource === 'placeholder' ? 2 : 0);
  }

  return 12;
}

function createCandidate(strategy, value, element = {}) {
  if (!value) {
    return null;
  }

  const withinForm = element.withinForm === true;
  const withinDialog = element.withinDialog === true;
  const contextReason = withinDialog ? 'dialog_scope' : withinForm ? 'form_scope' : null;
  const isTextInputLike =
    ['inputs', 'textareas', 'selects', 'checkboxes'].includes(element.group) ||
    ['textbox', 'searchbox', 'combobox', 'checkbox'].includes(element.role);

  const metadataByStrategy = {
    role: {
      score: 100,
      confidence: 'high',
      uniqueHint: 'high',
      stability: 'high',
      reasons: ['semantic_role_name'],
      fallbackReason: null,
    },
    label: {
      score: 94,
      confidence: 'high',
      uniqueHint: 'high',
      stability: 'high',
      reasons: ['associated_label'],
      fallbackReason: null,
    },
    testId: {
      score: 88,
      confidence: 'high',
      uniqueHint: 'high',
      stability: 'high',
      reasons: ['stable_test_id'],
      fallbackReason: null,
    },
    text: {
      score: isTextInputLike ? 64 : 80,
      confidence: 'medium',
      uniqueHint: 'medium',
      stability: 'medium',
      reasons: ['visible_text'],
      fallbackReason: null,
    },
    placeholder: {
      score: 66,
      confidence: 'medium',
      uniqueHint: 'medium',
      stability: 'medium',
      reasons: ['placeholder_text'],
      fallbackReason: null,
    },
    css: {
      score: 12,
      confidence: 'low',
      uniqueHint: 'low',
      stability: 'low',
      reasons: ['css_selector'],
      fallbackReason: 'css_fallback',
    },
  };

  const metadata = metadataByStrategy[strategy];
  if (!metadata) {
    return null;
  }

  const reasons = [...metadata.reasons];
  let score = buildSignalScore(strategy, value, element);

  if (contextReason && strategy !== 'css') {
    reasons.push(contextReason);
    score += 2;
  }

  if (element.visible === false) {
    score -= 16;
  }

  const locator = { strategy, value };

  return {
    locator,
    locatorType: strategy,
    score,
    confidence: metadata.confidence,
    uniqueHint: metadata.uniqueHint,
    stability: metadata.stability,
    reasons,
    fallbackReason: metadata.fallbackReason,
    matchCount: null,
    playwrightExpression: toPlaywrightExpression(locator),
    stabilityReason: reasons[0] ?? null,
  };
}

function compareRankedCandidates(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const strategyPriority = {
    role: 0,
    label: 1,
    testId: 2,
    text: 3,
    placeholder: 4,
    css: 5,
  };

  return (strategyPriority[left.locator.strategy] ?? 99) - (strategyPriority[right.locator.strategy] ?? 99);
}

export function rankLocatorCandidates(element = {}) {
  const roleName = element.accessibleName ?? element.name ?? element.attributes?.label ?? element.label ?? null;
  const candidates = [
    createCandidate('role', element.role && roleName ? { role: element.role, name: roleName, exact: true } : null, element),
    createCandidate('label', element.attributes?.label ?? element.label, element),
    createCandidate('testId', element.attributes?.testId ?? element.testId, element),
    createCandidate('text', element.visibleText ?? element.text, element),
    createCandidate('placeholder', element.attributes?.placeholder ?? element.placeholder, element),
    createCandidate('css', element.css, element),
  ].filter(Boolean);

  return candidates.sort(compareRankedCandidates);
}

export function unwrapRankedLocator(candidate = null) {
  return candidate?.locator?.strategy ? candidate.locator : candidate;
}
