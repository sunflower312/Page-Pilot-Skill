import test from 'node:test';
import assert from 'node:assert/strict';

import { waitForActionStability } from '../../scripts/lib/action-stability.js';

function createObservationSnapshot(overrides = {}) {
  const { semantic: _ignored, ...restOverrides } = overrides;
  const semanticOverrides = overrides.semantic ?? {};
  const regionsOverrides = semanticOverrides.regions ?? {};
  const interactionOverrides = semanticOverrides.interaction ?? {};

  return {
    url: 'https://app.example.test/workspace',
    title: 'Workspace',
    pages: [],
    documentId: 'doc-stable',
    readyState: 'complete',
    textLines: ['Stable workspace'],
    stats: { buttons: 2, inputs: 1, dialogs: 0, links: 1, forms: 1 },
    semantic: {
      activeDialog: null,
      primaryAction: {
        label: 'Save profile',
        role: 'button',
        disabled: false,
        withinDialog: false,
        withinForm: false,
        withinMain: false,
        testId: '',
      },
      regions: {
        dialog: '',
        main: 'Workspace overview Ready to save profile',
        feedback: '',
      },
      interaction: {
        busyCount: 0,
        disabledCount: 0,
        hiddenInteractiveCount: 0,
        checkedCount: 0,
        keyInteractives: [
          { label: 'Save profile', role: 'button', disabled: false, withinDialog: false, withinMain: false, withinForm: false },
        ],
      },
      ...semanticOverrides,
      regions: {
        dialog: '',
        main: 'Workspace overview Ready to save profile',
        feedback: '',
        ...regionsOverrides,
      },
      interaction: {
        busyCount: 0,
        disabledCount: 0,
        hiddenInteractiveCount: 0,
        checkedCount: 0,
        keyInteractives: [
          { label: 'Save profile', role: 'button', disabled: false, withinDialog: false, withinMain: false, withinForm: false },
        ],
        ...interactionOverrides,
      },
    },
    ...restOverrides,
  };
}

test('waitForActionStability resumes observation on the destination document after navigation destroys the old context', async () => {
  const waitForLoadStateCalls = [];
  const waitForFunctionCalls = [];
  let currentDocument = 'before';

  const page = {
    async waitForLoadState(state, options) {
      waitForLoadStateCalls.push({ state, timeout: options?.timeout ?? null, document: currentDocument });
    },
    async waitForFunction(_callback, args, options) {
      waitForFunctionCalls.push({
        timeout: options?.timeout ?? null,
        polling: options?.polling ?? null,
        stabilityKey: args?.stabilityKey ?? null,
        document: currentDocument,
      });

      if (waitForFunctionCalls.length === 1) {
        currentDocument = 'after';
        throw new Error('Execution context was destroyed, most likely because of a navigation');
      }

      return true;
    },
    async title() {
      return currentDocument === 'before' ? 'Email page' : 'Password page';
    },
    url() {
      return currentDocument === 'before'
        ? 'https://login.example.test/email'
        : 'https://login.example.test/password';
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      return currentDocument === 'before'
        ? {
            documentId: 'doc-email',
            readyState: 'complete',
            textLines: ['Enter your email'],
            stats: { buttons: 1, inputs: 1, dialogs: 0, links: 0, forms: 1 },
          }
        : {
            documentId: 'doc-password',
            readyState: 'complete',
            textLines: ['Enter your password'],
            stats: { buttons: 1, inputs: 1, dialogs: 0, links: 0, forms: 1 },
          };
    },
  };

  const stability = await waitForActionStability(
    page,
    {
      settleMs: 120,
      minObserveMs: 350,
      timeoutMs: 900,
    },
    {
      before: {
        url: 'https://login.example.test/email',
        title: 'Email page',
        pages: [],
        documentId: 'doc-email',
        readyState: 'complete',
        textLines: ['Enter your email'],
        stats: { buttons: 1, inputs: 1, dialogs: 0, links: 0, forms: 1 },
      },
    }
  );

  assert.equal(stability.status, 'settled');
  assert.equal(stability.settled, true);
  assert.equal(stability.trigger, 'url_change');
  assert.equal(stability.observation?.urlChanged, true);
  assert.equal(waitForLoadStateCalls.length, 2);
  assert.equal(waitForFunctionCalls.length, 2);
  assert.equal(waitForFunctionCalls[0].document, 'before');
  assert.equal(waitForFunctionCalls[1].document, 'after');
});

test('waitForActionStability treats a main-document switch without URL delta as dom_change', async () => {
  const page = {
    async waitForLoadState() {},
    async waitForFunction() {
      return true;
    },
    async title() {
      return 'Workspace';
    },
    url() {
      return 'https://app.example.test/workspace';
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      return {
        documentId: 'doc-after',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 2, inputs: 1, dialogs: 0, links: 1, forms: 1 },
      };
    },
  };

  const stability = await waitForActionStability(
    page,
    {
      settleMs: 120,
      minObserveMs: 350,
      timeoutMs: 900,
    },
    {
      before: {
        url: 'https://app.example.test/workspace',
        title: 'Workspace',
        pages: [],
        documentId: 'doc-before',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 2, inputs: 1, dialogs: 0, links: 1, forms: 1 },
      },
    }
  );

  assert.equal(stability.status, 'settled');
  assert.equal(stability.settled, true);
  assert.equal(stability.observation?.documentChanged, true);
  assert.equal(stability.trigger, 'dom_change');
});

test('waitForActionStability treats newly opened pages as dom_change', async () => {
  const currentPageRef = { url: () => 'https://app.example.test/workspace' };
  const popupPageRef = { url: () => 'https://app.example.test/module' };
  const page = {
    async waitForLoadState() {},
    async waitForFunction() {
      return true;
    },
    async title() {
      return 'Workspace';
    },
    url() {
      return 'https://app.example.test/workspace';
    },
    context() {
      return {
        pages: () => [currentPageRef, popupPageRef],
      };
    },
    async evaluate() {
      return {
        documentId: 'doc-stable',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 2, inputs: 1, dialogs: 0, links: 1, forms: 1 },
      };
    },
  };

  const stability = await waitForActionStability(
    page,
    {
      settleMs: 120,
      minObserveMs: 350,
      timeoutMs: 900,
    },
    {
      before: {
        url: 'https://app.example.test/workspace',
        title: 'Workspace',
        pages: [currentPageRef],
        documentId: 'doc-stable',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 2, inputs: 1, dialogs: 0, links: 1, forms: 1 },
      },
    }
  );

  assert.equal(stability.status, 'settled');
  assert.equal(stability.settled, true);
  assert.deepEqual(stability.observation?.openedPages, ['https://app.example.test/module']);
  assert.equal(stability.trigger, 'dom_change');
});

test('waitForActionStability treats dialog closure without url or coarse count changes as dom_change', async () => {
  const after = createObservationSnapshot({
    semantic: {
      activeDialog: null,
      primaryAction: {
        label: 'Save profile',
        role: 'button',
        disabled: false,
        withinDialog: false,
      },
      regions: {
        dialog: '',
        main: 'Workspace overview Ready to save profile',
      },
      interaction: {
        disabledCount: 0,
        keyInteractives: [{ label: 'Save profile', role: 'button', disabled: false, withinDialog: false }],
      },
    },
  });
  const before = createObservationSnapshot({
    semantic: {
      activeDialog: {
        label: 'Confirm changes',
        summary: 'Review the current step before continuing',
        primaryAction: { label: 'Continue', role: 'button', disabled: false, withinDialog: true },
      },
      primaryAction: {
        label: 'Continue',
        role: 'button',
        disabled: false,
        withinDialog: true,
      },
      regions: {
        dialog: 'Confirm changes Review the current step before continuing Continue',
        main: 'Workspace overview Ready to save profile',
      },
      interaction: {
        disabledCount: 0,
        keyInteractives: [{ label: 'Continue', role: 'button', disabled: false, withinDialog: true }],
      },
    },
  });
  const page = {
    async waitForLoadState() {},
    async waitForFunction() {
      return true;
    },
    async title() {
      return after.title;
    },
    url() {
      return after.url;
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      return {
        documentId: after.documentId,
        readyState: after.readyState,
        textLines: after.textLines,
        stats: after.stats,
        semantic: after.semantic,
      };
    },
  };

  const stability = await waitForActionStability(page, {}, { before });

  assert.equal(stability.trigger, 'dom_change');
  assert.equal(stability.observation?.semanticDiff?.dialogClosed, true);
  assert.deepEqual(
    stability.observation?.reasons?.filter((reason) => ['dialog_closed', 'primary_action_changed'].includes(reason)),
    ['dialog_closed', 'primary_action_changed']
  );
});

test('waitForActionStability treats primary action enablement changes as dom_change before coarse stats', async () => {
  const before = createObservationSnapshot({
    semantic: {
      primaryAction: {
        label: 'Save',
        role: 'button',
        disabled: true,
        withinDialog: false,
      },
      interaction: {
        disabledCount: 1,
        keyInteractives: [{ label: 'Save', role: 'button', disabled: true, withinDialog: false }],
      },
    },
  });
  const after = createObservationSnapshot({
    semantic: {
      primaryAction: {
        label: 'Save',
        role: 'button',
        disabled: false,
        withinDialog: false,
      },
      interaction: {
        disabledCount: 0,
        keyInteractives: [{ label: 'Save', role: 'button', disabled: false, withinDialog: false }],
      },
    },
  });
  const page = {
    async waitForLoadState() {},
    async waitForFunction() {
      return true;
    },
    async title() {
      return after.title;
    },
    url() {
      return after.url;
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      return {
        documentId: after.documentId,
        readyState: after.readyState,
        textLines: after.textLines,
        stats: after.stats,
        semantic: after.semantic,
      };
    },
  };

  const stability = await waitForActionStability(page, {}, { before });

  assert.equal(stability.trigger, 'dom_change');
  assert.equal(stability.observation?.semanticDiff?.primaryActionChanged, true);
  assert.deepEqual(stability.observation?.reasons, ['primary_action_changed', 'interaction_state_changed']);
});

test('waitForActionStability treats local main-region swaps as dom_change without navigation', async () => {
  const before = createObservationSnapshot({
    semantic: {
      regions: {
        main: 'Profile form Email field Security code Save profile',
        feedback: '',
      },
    },
  });
  const after = createObservationSnapshot({
    semantic: {
      regions: {
        main: 'Workspace summary Profile saved and main dashboard restored',
        feedback: '',
      },
    },
  });
  const page = {
    async waitForLoadState() {},
    async waitForFunction() {
      return true;
    },
    async title() {
      return after.title;
    },
    url() {
      return after.url;
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      return {
        documentId: after.documentId,
        readyState: after.readyState,
        textLines: after.textLines,
        stats: after.stats,
        semantic: after.semantic,
      };
    },
  };

  const stability = await waitForActionStability(page, {}, { before });

  assert.equal(stability.trigger, 'dom_change');
  assert.equal(stability.observation?.semanticDiff?.mainRegionChanged, true);
  assert.deepEqual(stability.observation?.reasons, ['main_region_changed']);
});

test('waitForActionStability treats checkbox-only semantic toggles as dom_change', async () => {
  const before = createObservationSnapshot({
    semantic: {
      interaction: {
        checkedCount: 0,
        keyInteractives: [
          {
            label: 'Receive product updates',
            role: 'checkbox',
            checked: false,
            disabled: false,
            withinDialog: false,
            withinMain: true,
            withinForm: true,
          },
        ],
      },
    },
  });
  const after = createObservationSnapshot({
    semantic: {
      interaction: {
        checkedCount: 1,
        keyInteractives: [
          {
            label: 'Receive product updates',
            role: 'checkbox',
            checked: true,
            disabled: false,
            withinDialog: false,
            withinMain: true,
            withinForm: true,
          },
        ],
      },
    },
  });
  const page = {
    async waitForLoadState() {},
    async waitForFunction() {
      return true;
    },
    async title() {
      return after.title;
    },
    url() {
      return after.url;
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      return {
        documentId: after.documentId,
        readyState: after.readyState,
        textLines: after.textLines,
        stats: after.stats,
        semantic: after.semantic,
      };
    },
  };

  const stability = await waitForActionStability(page, {}, { before });

  assert.equal(stability.trigger, 'dom_change');
  assert.equal(stability.observation?.newText.length, 0);
  assert.equal(stability.observation?.removedText.length, 0);
  assert.equal(stability.observation?.semanticDiff?.interactionStateChanged, true);
  assert.deepEqual(stability.observation?.reasons, ['interaction_state_changed']);
});

test('waitForActionStability treats removed text without added text as dom_change', async () => {
  const before = createObservationSnapshot({
    textLines: ['Stable workspace', 'Select a plan to continue'],
  });
  const after = createObservationSnapshot({
    textLines: ['Stable workspace'],
  });
  const page = {
    async waitForLoadState() {},
    async waitForFunction() {
      return true;
    },
    async title() {
      return after.title;
    },
    url() {
      return after.url;
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      return {
        documentId: after.documentId,
        readyState: after.readyState,
        textLines: after.textLines,
        stats: after.stats,
        semantic: after.semantic,
      };
    },
  };

  const stability = await waitForActionStability(page, {}, { before });

  assert.equal(stability.trigger, 'dom_change');
  assert.deepEqual(stability.observation?.newText, []);
  assert.deepEqual(stability.observation?.removedText, ['Select a plan to continue']);
});
