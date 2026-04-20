import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveSemanticTargetFromLocator, rankSemanticTarget } from '../../scripts/lib/locator-ranking-tool.js';

function buildScan() {
  return {
    interactives: {
      inputs: [
        {
          role: 'textbox',
          accessibleName: 'Email',
          visibleText: '',
          description: '',
          attributes: {
            label: 'Email',
            placeholder: 'email@example.com',
            testId: '',
          },
          actionability: { actionable: true, visible: true, enabled: true },
          confidence: { score: 0.9 },
          preferredLocator: { strategy: 'role', value: { role: 'textbox', name: 'Email' } },
          fallbackLocators: [{ strategy: 'placeholder', value: 'email@example.com' }],
          recommendedLocators: [
            { locator: { strategy: 'role', value: { role: 'textbox', name: 'Email' } }, score: 95 },
            { locator: { strategy: 'placeholder', value: 'email@example.com' }, score: 82 },
          ],
          stableFingerprint: {
            role: 'textbox',
            accessibleName: 'Email',
            testId: '',
            context: { withinForm: true },
          },
        },
      ],
      buttons: [
        {
          role: 'button',
          accessibleName: 'Submit',
          visibleText: 'Submit',
          description: '',
          attributes: {
            label: '',
            placeholder: '',
            testId: 'submit-button',
          },
          actionability: { actionable: true, visible: true, enabled: true },
          confidence: { score: 0.95 },
          preferredLocator: { strategy: 'role', value: { role: 'button', name: 'Submit' } },
          fallbackLocators: [{ strategy: 'testId', value: 'submit-button' }],
          recommendedLocators: [
            { locator: { strategy: 'role', value: { role: 'button', name: 'Submit' } }, score: 94 },
            { locator: { strategy: 'testId', value: 'submit-button' }, score: 86 },
          ],
          stableFingerprint: {
            role: 'button',
            accessibleName: 'Submit',
            testId: 'submit-button',
            context: { withinForm: true },
          },
        },
      ],
    },
  };
}

test('deriveSemanticTargetFromLocator maps placeholder locators to placeholder attributes', () => {
  const target = deriveSemanticTargetFromLocator({ strategy: 'placeholder', value: 'email@example.com' });

  assert.deepEqual(target, {
    attributes: {
      placeholder: 'email@example.com',
    },
  });
});

test('rankSemanticTarget rejects actionable-only candidates without semantic matches', () => {
  const ranked = rankSemanticTarget(buildScan(), { description: 'totally-missing-description' });

  assert.equal(ranked.matchCount, 0);
  assert.deepEqual(ranked.matches, []);
});

test('rankSemanticTarget matches placeholder targets to placeholder-bearing elements only', () => {
  const ranked = rankSemanticTarget(buildScan(), {
    attributes: {
      placeholder: 'email@example.com',
    },
  });

  assert.equal(ranked.matchCount, 1);
  assert.equal(ranked.matches[0].element.role, 'textbox');
  assert.ok(ranked.matches[0].reasons.some((reason) => reason.includes('placeholder')));
  assert.equal(ranked.matches[0].element.accessibleName, 'Email');
});
