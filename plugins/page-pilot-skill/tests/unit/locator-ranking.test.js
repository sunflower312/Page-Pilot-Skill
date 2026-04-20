import test from 'node:test';
import assert from 'node:assert/strict';

import { rankLocatorCandidates } from '../../scripts/lib/locator-ranking.js';

test('rankLocatorCandidates keeps semantic ordering and exposes the public candidate contract', () => {
  const ranked = rankLocatorCandidates({
    role: 'textbox',
    accessibleName: 'Email',
    visibleText: 'Email',
    attributes: {
      label: 'Email',
      placeholder: 'email@example.com',
      testId: 'email-input',
    },
    css: '#email',
    confidence: { score: 0.9 },
    withinForm: true,
    group: 'inputs',
  });

  assert.deepEqual(
    ranked.map((candidate) => candidate.locatorType),
    ['role', 'label', 'testId', 'text', 'placeholder', 'css']
  );

  assert.equal(ranked[0].playwrightExpression, 'page.getByRole("textbox", { name: "Email", exact: true })');
  assert.equal(ranked[0].stabilityReason, 'semantic_role_name');
  assert.equal(ranked[0].fallbackReason, null);
  assert.equal(ranked[0].confidence, 'high');
  assert.equal(ranked[0].matchCount, null);
  assert.equal(ranked[0].locator.strategy, 'role');

  assert.equal(ranked[ranked.length - 1].locatorType, 'css');
  assert.equal(ranked[ranked.length - 1].fallbackReason, 'css_fallback');
  assert.equal(ranked[ranked.length - 1].playwrightExpression, 'page.locator("#email")');
});
