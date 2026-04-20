import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocatorChoices } from '../../scripts/tools/locator-choices.js';

test('buildLocatorChoices reports the final fallback locator when role exact match falls back to fuzzy match', async () => {
  const page = {
    getByRole(role, options) {
      const exact = options?.exact !== false;
      return {
        first() {
          return {
            isVisible: async () => true,
            isEnabled: async () => true,
            isEditable: async () => true,
          };
        },
        count: async () => (exact ? 0 : 1),
      };
    },
  };

  const [choice] = await buildLocatorChoices(
    page,
    [
      {
        locator: {
          strategy: 'role',
          value: {
            role: 'button',
            name: 'Submit',
            exact: true,
          },
        },
      },
    ],
    'click'
  );

  assert.deepEqual(choice.locator, {
    strategy: 'role',
    value: {
      role: 'button',
      name: 'Submit',
      exact: false,
    },
  });
  assert.equal(choice.playwrightExpression, 'page.getByRole("button", { name: "Submit", exact: false })');
  assert.equal(choice.matchCount, 1);
});
