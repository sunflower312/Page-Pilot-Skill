import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeVerifiedLocatorChoices } from '../../scripts/tools/analysis-tools.js';

test('mergeVerifiedLocatorChoices rewrites preferred and recommended locators to the verified fallback locator', () => {
  const match = {
    element: {
      preferredLocator: {
        strategy: 'role',
        value: { role: 'button', name: 'Continue', exact: true },
      },
      recommendedLocators: [
        {
          locator: {
            strategy: 'role',
            value: { role: 'button', name: 'Continue', exact: true },
          },
        },
      ],
      fallbackLocators: [],
    },
    recommendedLocators: [
      {
        locator: {
          strategy: 'role',
          value: { role: 'button', name: 'Continue', exact: true },
        },
      },
    ],
    preferredLocator: {
      strategy: 'role',
      value: { role: 'button', name: 'Continue', exact: true },
    },
    fallbackLocators: [],
    reasons: ['semantic_role_name'],
  };
  const merged = mergeVerifiedLocatorChoices(match, [
    {
      locator: {
        strategy: 'role',
        value: { role: 'button', name: 'Continue', exact: false },
      },
      locatorType: 'role',
      matchCount: 1,
      playwrightExpression: 'page.getByRole("button", { name: "Continue", exact: false })',
      stabilityReason: 'semantic_role_name',
      fallbackReason: null,
      confidence: 'high',
    },
  ]);

  assert.deepEqual(merged.preferredLocator, {
    strategy: 'role',
    value: { role: 'button', name: 'Continue', exact: false },
  });
  assert.deepEqual(merged.recommendedLocators[0].locator, {
    strategy: 'role',
    value: { role: 'button', name: 'Continue', exact: false },
  });
  assert.deepEqual(merged.element.preferredLocator, {
    strategy: 'role',
    value: { role: 'button', name: 'Continue', exact: false },
  });
  assert.deepEqual(merged.element.recommendedLocators[0].locator, {
    strategy: 'role',
    value: { role: 'button', name: 'Continue', exact: false },
  });
  assert.equal(merged.playwrightExpression, 'page.getByRole("button", { name: "Continue", exact: false })');
  assert.equal(merged.matchCount, 1);
});
