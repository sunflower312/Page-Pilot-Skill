import { verifyLocatorCandidate } from '../lib/locator-runtime.js';
import { toPlaywrightExpression } from '../lib/playwright-locator-expression.js';

export async function buildLocatorChoices(page, locatorCandidates = [], usage = 'click') {
  const choices = [];
  const seen = new Set();

  for (const candidate of locatorCandidates) {
    const locator = candidate?.locator?.strategy ? candidate.locator : candidate;
    if (!locator?.strategy) {
      continue;
    }

    const key = JSON.stringify(locator);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const verification = await verifyLocatorCandidate(page, locator, usage).catch(() => null);
    choices.push({
      ...candidate,
      locator,
      locatorType: locator.strategy,
      matchCount: verification?.inspection?.count ?? candidate?.matchCount ?? null,
      playwrightExpression: candidate?.playwrightExpression ?? toPlaywrightExpression(locator),
      stabilityReason: candidate?.stabilityReason ?? candidate?.reasons?.[0] ?? null,
      fallbackReason: candidate?.fallbackReason ?? (locator.strategy === 'css' ? 'css_fallback' : null),
      confidence: candidate?.confidence ?? null,
    });
  }

  return choices;
}
