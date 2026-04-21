import { toPlaywrightExpression } from '../lib/playwright-locator-expression.js';

export function mergeVerifiedLocatorChoices(match = {}, locatorChoices = []) {
  const preferredChoice = locatorChoices[0] ?? null;
  const preferredLocator = preferredChoice?.locator ?? match.preferredLocator ?? null;
  const fallbackLocators = locatorChoices.slice(1).map((choice) => choice.locator).filter(Boolean);
  const element =
    match.element && typeof match.element === 'object'
      ? {
          ...match.element,
          recommendedLocators: locatorChoices,
          preferredLocator,
          fallbackLocators,
        }
      : match.element ?? null;

  return {
    ...match,
    element,
    recommendedLocators: locatorChoices,
    preferredLocator,
    fallbackLocators,
    locatorChoices,
    matchCount: preferredChoice?.matchCount ?? null,
    locatorType: preferredChoice?.locatorType ?? preferredLocator?.strategy ?? null,
    playwrightExpression:
      preferredChoice?.playwrightExpression ??
      (preferredLocator ? toPlaywrightExpression(preferredLocator) : null),
    stabilityReason: preferredChoice?.stabilityReason ?? match.reasons?.[0] ?? null,
    fallbackReason: preferredChoice?.fallbackReason ?? (preferredLocator?.strategy === 'css' ? 'css_fallback' : null),
  };
}

function buildGeneratedSource({
  sessionId,
  generatedFrom,
  startUrl,
  finalUrl,
  actionCount,
  assertionCount,
}) {
  return {
    sessionId,
    generatedFrom,
    startUrl,
    finalUrl,
    actionCount,
    assertionCount,
  };
}

export function buildGeneratedPlaywrightResponse({
  sessionId,
  generated,
  generatedFrom,
  startUrl,
  finalUrl,
  actionCount,
  assertionCount,
}) {
  return {
    ok: true,
    language: 'ts',
    framework: 'playwright-test',
    code: generated.code,
    warnings: generated.warnings,
    locatorChoices: generated.locatorChoices,
    fallbackLocatorChoices: generated.fallbackLocatorChoices,
    expectedStateChanges: generated.expectedStateChanges,
    assertionPlan: generated.assertionPlan,
    generatedPlan: generated.generatedPlan,
    metrics: generated.metrics,
    source: buildGeneratedSource({
      sessionId,
      generatedFrom,
      startUrl,
      finalUrl,
      actionCount,
      assertionCount,
    }),
  };
}
