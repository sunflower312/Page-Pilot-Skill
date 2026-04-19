import test from 'node:test';
import assert from 'node:assert/strict';

import { buildObservation, captureObservationSnapshot, hasMainDocumentTransition } from '../../scripts/lib/observation.js';

const DOCUMENT_IDENTITY_KEY = '__agentBrowserHeadlessDocumentIdentity__';

function setGlobalValue(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobalValue(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  delete globalThis[name];
}

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

function createSnapshotHarness(states) {
  let activeIndex = 0;
  let currentSnapshotState = states[0];
  const originalNavigation = Object.getOwnPropertyDescriptor(globalThis, 'navigation');
  const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalIdentity = Object.getOwnPropertyDescriptor(globalThis, DOCUMENT_IDENTITY_KEY);

  delete globalThis[DOCUMENT_IDENTITY_KEY];

  return {
    cleanup() {
      restoreGlobalValue('navigation', originalNavigation);
      restoreGlobalValue('performance', originalPerformance);
      restoreGlobalValue('document', originalDocument);
      restoreGlobalValue(DOCUMENT_IDENTITY_KEY, originalIdentity);
    },
    page: {
      async title() {
        return currentSnapshotState.title;
      },
      url() {
        return currentSnapshotState.url;
      },
      context() {
        return {
          pages: () => [],
        };
      },
      async evaluate(callback, payload) {
        const state = states[activeIndex];
        currentSnapshotState = state;
        if (state.resetIdentity) {
          delete globalThis[DOCUMENT_IDENTITY_KEY];
        }
        setGlobalValue('navigation', { currentEntry: { key: state.navigationKey } });
        setGlobalValue('performance', { timeOrigin: state.timeOrigin });
        setGlobalValue('document', {
          readyState: 'complete',
          URL: state.url,
          body: {
            innerText: state.text,
          },
          querySelectorAll() {
            return [];
          },
        });
        const result = callback(payload);
        activeIndex += 1;
        return result;
      },
    },
  };
}

test('captureObservationSnapshot and buildObservation summarize page changes', async () => {
  const snapshots = [
    {
      documentId: 'doc-before',
      readyState: 'complete',
      textLines: ['Initial line'],
      stats: { buttons: 1, inputs: 1, dialogs: 0, links: 1, forms: 1 },
    },
    {
      documentId: 'doc-after',
      readyState: 'complete',
      textLines: ['Initial line', 'Success banner'],
      stats: { buttons: 2, inputs: 1, dialogs: 1, links: 1, forms: 1 },
    },
  ];
  let evaluateIndex = 0;
  let currentUrl = 'http://fixture.local/before';
  const currentPageRef = { url: () => currentUrl };
  let currentPages = [currentPageRef];

  const page = {
    currentTitle: 'Before',
    async title() {
      return this.currentTitle;
    },
    url() {
      return currentUrl;
    },
    context() {
      return {
        pages: () => currentPages,
      };
    },
    async evaluate() {
      return snapshots[evaluateIndex++];
    },
  };

  const before = await captureObservationSnapshot(page);
  page.currentTitle = 'After';
  currentUrl = 'http://fixture.local/after';
  const after = await captureObservationSnapshot(page);
  const observation = buildObservation(before, after);

  assert.equal(observation.urlChanged, true);
  assert.equal(observation.documentChanged, true);
  assert.equal(observation.titleChanged, true);
  assert.equal(observation.newText.includes('Success banner'), true);
  assert.deepEqual(observation.openedPages, []);
  assert.equal(observation.domChange.buttons, 1);
  assert.equal(observation.domChange.dialogs, 1);
});

test('buildObservation detects newly opened pages by identity even when URLs match', () => {
  const sharedUrl = 'http://fixture.local/workspace';
  const currentPageRef = { url: () => sharedUrl };
  const existingPopupRef = { url: () => sharedUrl };
  const newPopupRef = { url: () => sharedUrl };

  const observation = buildObservation(
    {
      url: sharedUrl,
      title: 'Workspace',
      pages: [currentPageRef, existingPopupRef],
      textLines: ['Stable text'],
      stats: { buttons: 1 },
    },
    {
      url: sharedUrl,
      title: 'Workspace',
      pages: [currentPageRef, existingPopupRef, newPopupRef],
      textLines: ['Stable text'],
      stats: { buttons: 1 },
    }
  );

  assert.deepEqual(observation.openedPages, [sharedUrl]);
});

test('captureObservationSnapshot retries transient navigation failures and captures the destination document', async () => {
  const navigationErrorMessage = 'page.evaluate: Execution context was destroyed, most likely because of a navigation';
  let ready = false;
  const waitCalls = [];
  const page = {
    async title() {
      if (!ready) {
        throw new Error(navigationErrorMessage);
      }
      return 'After navigation';
    },
    url() {
      return ready ? 'http://fixture.local/after' : 'http://fixture.local/before';
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate() {
      if (!ready) {
        throw new Error(navigationErrorMessage);
      }
      return {
        documentId: 'doc-after',
        readyState: 'complete',
        textLines: ['Arrived after navigation'],
        stats: { buttons: 0, inputs: 0, dialogs: 0, links: 0, forms: 0 },
      };
    },
    async waitForLoadState(state, options) {
      waitCalls.push({ state, timeout: options?.timeout });
      ready = true;
    },
  };

  const snapshot = await captureObservationSnapshot(page);

  assert.equal(snapshot.url, 'http://fixture.local/after');
  assert.equal(snapshot.title, 'After navigation');
  assert.equal(snapshot.documentId, 'doc-after');
  assert.equal(snapshot.readyState, 'complete');
  assert.equal(snapshot.textLines.includes('Arrived after navigation'), true);
  assert.deepEqual(waitCalls, [{ state: 'domcontentloaded', timeout: 1500 }]);
});

test('captureObservationSnapshot keeps document identity stable across same-document pushState navigation', async () => {
  const harness = createSnapshotHarness([
    {
      url: 'http://fixture.local/workspace',
      title: 'Workspace',
      navigationKey: 'entry-before',
      timeOrigin: 1000,
      text: 'Before pushState',
    },
    {
      url: 'http://fixture.local/workspace?tab=details',
      title: 'Workspace details',
      navigationKey: 'entry-after',
      timeOrigin: 1000,
      text: 'After pushState',
    },
  ]);

  try {
    const before = await captureObservationSnapshot(harness.page);
    const after = await captureObservationSnapshot(harness.page);
    const observation = buildObservation(before, after);

    assert.equal(observation.documentChanged, false);
    assert.equal(observation.urlChanged, true);
    assert.equal(hasMainDocumentTransition(before, after), false);
  } finally {
    harness.cleanup();
  }
});

test('captureObservationSnapshot keeps document identity stable across hash-only navigation', async () => {
  const harness = createSnapshotHarness([
    {
      url: 'http://fixture.local/workspace',
      title: 'Workspace',
      navigationKey: 'entry-before',
      timeOrigin: 1000,
      text: 'Before hash change',
    },
    {
      url: 'http://fixture.local/workspace#section-2',
      title: 'Workspace section 2',
      navigationKey: 'entry-after',
      timeOrigin: 1000,
      text: 'After hash change',
    },
  ]);

  try {
    const before = await captureObservationSnapshot(harness.page);
    const after = await captureObservationSnapshot(harness.page);
    const observation = buildObservation(before, after);

    assert.equal(observation.documentChanged, false);
    assert.equal(observation.urlChanged, true);
    assert.equal(hasMainDocumentTransition(before, after), false);
  } finally {
    harness.cleanup();
  }
});

test('captureObservationSnapshot preserves lightweight text multiplicity alongside compact textLines', async () => {
  const harness = createSnapshotHarness([
    {
      url: 'http://fixture.local/workspace',
      title: 'Workspace',
      navigationKey: 'entry-before',
      timeOrigin: 1000,
      text: 'Stable workspace\nSaved\nSaved',
    },
  ]);

  try {
    const snapshot = await captureObservationSnapshot(harness.page);

    assert.deepEqual(snapshot.textLines, ['Stable workspace', 'Saved']);
    assert.deepEqual(snapshot.textLineCounts, {
      'Stable workspace': 1,
      Saved: 2,
    });
  } finally {
    harness.cleanup();
  }
});

test('captureObservationSnapshot marks a real new document as changed', async () => {
  const harness = createSnapshotHarness([
    {
      url: 'http://fixture.local/workspace',
      title: 'Workspace',
      navigationKey: 'entry-before',
      timeOrigin: 1000,
      text: 'Before navigation',
    },
    {
      url: 'http://fixture.local/next-page',
      title: 'Next page',
      navigationKey: 'entry-after',
      timeOrigin: 2000,
      text: 'After navigation',
      resetIdentity: true,
    },
  ]);

  try {
    const before = await captureObservationSnapshot(harness.page);
    const after = await captureObservationSnapshot(harness.page);
    const observation = buildObservation(before, after);

    assert.equal(observation.documentChanged, true);
    assert.equal(hasMainDocumentTransition(before, after), true);
  } finally {
    harness.cleanup();
  }
});

test('hasMainDocumentTransition ignores title, text, dom and popup changes without a main-document switch', () => {
  const sharedUrl = 'http://fixture.local/workspace';
  const currentPageRef = { url: () => sharedUrl };
  const popupRef = { url: () => 'http://fixture.local/popup' };
  const before = {
    url: sharedUrl,
    title: 'Before',
    documentId: 'doc-stable',
    pages: [currentPageRef],
    textLines: ['Before text'],
    stats: { buttons: 1, dialogs: 0 },
  };
  const after = {
    url: sharedUrl,
    title: 'After',
    documentId: 'doc-stable',
    pages: [currentPageRef, popupRef],
    textLines: ['Before text', 'Changed content'],
    stats: { buttons: 2, dialogs: 1 },
  };

  const observation = buildObservation(before, after);

  assert.equal(observation.titleChanged, true);
  assert.equal(observation.newText.includes('Changed content'), true);
  assert.deepEqual(observation.openedPages, ['http://fixture.local/popup']);
  assert.equal(hasMainDocumentTransition(before, after, observation), false);
});

test('buildObservation reports semantic dialog closure and primary action handoff', () => {
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

  const observation = buildObservation(before, after);

  assert.equal(observation.semanticDiff?.dialogChanged, true);
  assert.equal(observation.semanticDiff?.dialogClosed, true);
  assert.equal(observation.semanticDiff?.primaryActionChanged, true);
  assert.deepEqual(
    observation.reasons?.filter((reason) => ['dialog_closed', 'primary_action_changed'].includes(reason)),
    ['dialog_closed', 'primary_action_changed']
  );
});

test('buildObservation reports semantic primary action state changes without coarse dom deltas', () => {
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

  const observation = buildObservation(before, after);

  assert.equal(observation.newText.length, 0);
  assert.equal(Object.values(observation.domChange).every((delta) => delta === 0), true);
  assert.equal(observation.semanticDiff?.primaryActionChanged, true);
  assert.equal(observation.semanticDiff?.interactionStateChanged, true);
  assert.deepEqual(observation.reasons, ['primary_action_changed', 'interaction_state_changed']);
});

test('buildObservation reports semantic main and feedback region swaps with stable url and counts', () => {
  const before = createObservationSnapshot({
    semantic: {
      regions: {
        main: 'Profile form Email field Security code Save profile',
        feedback: 'Draft not saved',
      },
    },
  });
  const after = createObservationSnapshot({
    semantic: {
      regions: {
        main: 'Workspace summary Profile saved and main dashboard restored',
        feedback: 'Profile saved successfully',
      },
    },
  });

  const observation = buildObservation(before, after);

  assert.equal(observation.semanticDiff?.mainRegionChanged, true);
  assert.equal(observation.semanticDiff?.feedbackChanged, true);
  assert.deepEqual(observation.reasons, ['main_region_changed', 'feedback_changed']);
});

test('buildObservation reports checkbox-only toggles through interaction semantics', () => {
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

  const observation = buildObservation(before, after);

  assert.equal(observation.newText.length, 0);
  assert.equal(observation.removedText.length, 0);
  assert.equal(Object.values(observation.domChange).every((delta) => delta === 0), true);
  assert.equal(observation.semanticDiff?.interactionStateChanged, true);
  assert.equal(observation.semanticDiff?.details?.interaction?.before?.checkedCount, 0);
  assert.equal(observation.semanticDiff?.details?.interaction?.after?.checkedCount, 1);
  assert.equal(observation.semanticDiff?.details?.interaction?.after?.keyInteractives[0]?.checked, true);
  assert.deepEqual(observation.reasons, ['interaction_state_changed']);
});

test('buildObservation reports removedText when helper copy disappears without replacement', () => {
  const before = createObservationSnapshot({
    textLines: ['Stable workspace', 'Select a plan to continue'],
  });
  const after = createObservationSnapshot({
    textLines: ['Stable workspace'],
  });

  const observation = buildObservation(before, after);

  assert.deepEqual(observation.newText, []);
  assert.deepEqual(observation.removedText, ['Select a plan to continue']);
  assert.equal(Object.values(observation.domChange).every((delta) => delta === 0), true);
  assert.equal(observation.semanticDiff?.mainRegionChanged, false);
});

test('buildObservation reports removedText when duplicate helper copy disappears once but still exists elsewhere', () => {
  const before = createObservationSnapshot({
    textLines: ['Stable workspace', 'Saved', 'Saved'],
  });
  const after = createObservationSnapshot({
    textLines: ['Stable workspace', 'Saved'],
  });

  const observation = buildObservation(before, after);

  assert.deepEqual(observation.newText, []);
  assert.deepEqual(observation.removedText, ['Saved']);
  assert.equal(Object.values(observation.domChange).every((delta) => delta === 0), true);
});
