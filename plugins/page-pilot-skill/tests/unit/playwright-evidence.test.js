import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSessionValidationEvidence, storeValidation } from '../../scripts/tools/playwright-evidence.js';

test('storeValidation preserves earlier passed evidence when a later validation fails', () => {
  const session = {
    validationHistory: [],
    lastValidation: null,
  };

  storeValidation(
    session,
    {
      validation: {
        passed: true,
        firstPass: true,
        repaired: false,
        metrics: {
          actionCount: 1,
          assertionCount: 0,
        },
      },
      source: {
        startUrl: 'https://example.test/start',
        finalUrl: 'https://example.test/after-pass',
      },
      evidence: {
        steps: [{ action: 'click' }],
      },
      steps: [
        {
          type: 'click',
          locatorChoice: { strategy: 'role', value: { role: 'button', name: 'Submit', exact: true } },
          codegenVerification: { unique: true, usable: true },
        },
      ],
    },
    [{ type: 'click' }]
  );

  storeValidation(
    session,
    {
      validation: {
        passed: false,
        firstPass: false,
        repaired: false,
        metrics: {
          actionCount: 1,
          assertionCount: 0,
        },
      },
      source: {
        startUrl: 'https://example.test/start',
        finalUrl: 'https://example.test/after-fail',
      },
      evidence: {
        steps: [{ action: 'click' }],
      },
      steps: [{ type: 'click' }],
      error: {
        code: 'ACTION_STEP_FAILED',
      },
    },
    [{ type: 'click' }]
  );

  const evidence = buildSessionValidationEvidence(session);

  assert.ok(evidence);
  assert.equal(session.validationHistory.length, 1);
  assert.equal(session.lastValidation.validation.passed, false);
  assert.equal(evidence.source.startUrl, 'https://example.test/start');
  assert.equal(evidence.source.finalUrl, 'https://example.test/after-pass');
  assert.equal(evidence.steps.length, 1);
  assert.equal(evidence.validation.passed, true);
});
