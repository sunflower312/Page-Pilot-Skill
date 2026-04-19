import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSemanticSnapshot, selectPrimaryAction } from '../../scripts/lib/semantic-model.js';

test('selectPrimaryAction excludes disabled links just like disabled buttons', () => {
  const primaryAction = selectPrimaryAction([
    {
      group: 'links',
      role: 'link',
      label: 'Save',
      text: 'Save',
      withinMain: true,
      visible: true,
      disabled: true,
      ariaDisabled: 'true',
      domIndex: 0,
    },
    {
      group: 'buttons',
      role: 'button',
      label: 'Resume',
      text: 'Resume',
      withinMain: true,
      visible: true,
      disabled: false,
      domIndex: 1,
    },
    {
      group: 'buttons',
      role: 'button',
      label: 'Continue',
      text: 'Continue',
      withinMain: true,
      visible: true,
      disabled: true,
      ariaDisabled: 'true',
      domIndex: 2,
    },
  ]);

  assert.equal(primaryAction?.label ?? primaryAction?.name, 'Resume');
});

test('buildSemanticSnapshot recomputes primaryAction from semantic interaction candidates instead of trusting precomputed primaryAction', () => {
  const snapshot = buildSemanticSnapshot({
    activeDialog: null,
    primaryAction: {
      label: 'Cancel',
      role: 'button',
      disabled: false,
      withinDialog: false,
      withinForm: true,
      withinMain: true,
    },
    regions: {
      dialog: '',
      main: 'Step details Continue or Cancel',
      feedback: '',
    },
    interaction: {
      busyCount: 0,
      disabledCount: 0,
      hiddenInteractiveCount: 0,
      checkedCount: 0,
      keyInteractives: [
        {
          label: 'Cancel',
          role: 'button',
          disabled: false,
          withinDialog: false,
          withinForm: true,
          withinMain: true,
        },
        {
          label: 'Continue',
          role: 'button',
          disabled: false,
          withinDialog: false,
          withinForm: true,
          withinMain: true,
        },
      ],
    },
  });

  assert.equal(snapshot.primaryAction?.label, 'Continue');
  assert.equal(snapshot.interaction.keyInteractives[0]?.label, 'Continue');
});

test('buildSemanticSnapshot does not let an external primaryAction override real interaction candidates', () => {
  const snapshot = buildSemanticSnapshot({
    activeDialog: null,
    primaryAction: {
      label: 'Submit order',
      role: 'button',
      testId: 'external-primary',
      disabled: false,
      withinDialog: false,
      withinForm: true,
      withinMain: true,
    },
    regions: {
      dialog: '',
      main: 'Step details Continue or Submit order',
      feedback: '',
    },
    interaction: {
      busyCount: 0,
      disabledCount: 0,
      hiddenInteractiveCount: 0,
      checkedCount: 0,
      keyInteractives: [
        {
          label: 'Continue',
          role: 'button',
          disabled: false,
          withinDialog: false,
          withinForm: true,
          withinMain: true,
        },
      ],
    },
  });

  assert.equal(snapshot.primaryAction?.label, 'Continue');
  assert.equal(snapshot.interaction.keyInteractives[0]?.label, 'Continue');
});

test('buildSemanticSnapshot falls back to the semantic primaryAction only when no actionable interaction candidate exists', () => {
  const snapshot = buildSemanticSnapshot({
    activeDialog: null,
    primaryAction: {
      label: 'Submit order',
      role: 'button',
      disabled: false,
      withinDialog: false,
      withinForm: true,
      withinMain: true,
    },
    regions: {
      dialog: '',
      main: 'Checkout details',
      feedback: '',
    },
    interaction: {
      busyCount: 0,
      disabledCount: 0,
      hiddenInteractiveCount: 0,
      checkedCount: 0,
      keyInteractives: [
        {
          label: 'Email',
          role: 'textbox',
          disabled: false,
          withinDialog: false,
          withinForm: true,
          withinMain: true,
        },
      ],
    },
  });

  assert.equal(snapshot.primaryAction?.label, 'Submit order');
  assert.equal(snapshot.interaction.keyInteractives[0]?.label, 'Email');
});
