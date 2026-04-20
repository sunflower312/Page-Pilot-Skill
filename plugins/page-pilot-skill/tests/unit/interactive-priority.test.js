import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as semanticModel from '../../scripts/lib/semantic-model.js';
import { captureObservationSnapshot } from '../../scripts/lib/observation.js';
import { collectStructuredPageData } from '../../scripts/lib/structured-scan.js';

function createEmptySemanticRaw() {
  return {
    dialogs: [],
    interactives: [],
    regions: {
      dialog: '',
      main: '',
      feedback: '',
    },
    interaction: {
      busyCount: 0,
      disabledCount: 0,
      hiddenInteractiveCount: 0,
      checkedCount: 0,
      keyInteractives: [],
    },
  };
}

test('captureObservationSnapshot reuses the shared interactive priority config for browser-side collection', async () => {
  const priorityModule = await import('../../scripts/lib/interactive-priority.js').catch((error) => error);

  assert.equal(priorityModule instanceof Error, false);
  assert.deepEqual(semanticModel.INTERACTIVE_PRIORITY_CONFIG, priorityModule.INTERACTIVE_PRIORITY_CONFIG);

  let receivedPayload;
  const page = {
    async title() {
      return 'Workspace';
    },
    url() {
      return 'https://fixture.local/workspace';
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate(_callback, payload) {
      receivedPayload = payload;
      return {
        documentId: 'doc-stable',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 0, inputs: 0, dialogs: 0, links: 0, forms: 0 },
        semanticRaw: createEmptySemanticRaw(),
      };
    },
  };

  await captureObservationSnapshot(page);

  assert.deepEqual(receivedPayload?.interactivePriorityConfig, priorityModule.INTERACTIVE_PRIORITY_CONFIG);
});

test('interactive priority patterns live in the shared module instead of being duplicated in observation or semantic-model', async () => {
  const [sharedSource, observationSource, semanticModelSource] = await Promise.all([
    readFile(new URL('../../scripts/lib/interactive-priority.js', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/lib/observation.js', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/lib/semantic-model.js', import.meta.url), 'utf8'),
  ]);
  const forwardPatternToken = 'start|resume|next|continue|save|confirm|submit|send|search|finish|complete|done';
  const chromePatternToken = 'read more|learn more|documentation|docs';

  assert.equal(sharedSource.includes(forwardPatternToken), true);
  assert.equal(sharedSource.includes(chromePatternToken), true);
  assert.equal(observationSource.includes(forwardPatternToken), false);
  assert.equal(observationSource.includes(chromePatternToken), false);
  assert.equal(semanticModelSource.includes(forwardPatternToken), false);
  assert.equal(semanticModelSource.includes(chromePatternToken), false);
});

test('observation and structured scan receive the same shared browser interactive runtime source', async () => {
  let observationPayload;
  let structuredPayload;
  const observationPage = {
    async title() {
      return 'Workspace';
    },
    url() {
      return 'https://fixture.local/workspace';
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate(_callback, payload) {
      observationPayload = payload;
      return {
        documentId: 'doc-stable',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 0, inputs: 0, dialogs: 0, links: 0, forms: 0 },
        semanticRaw: createEmptySemanticRaw(),
      };
    },
  };
  const structuredPage = {
    async evaluate(_callback, payload) {
      structuredPayload = payload;
      return {
        title: 'Structured fixture',
        url: 'https://fixture.local/workspace',
        text: 'Structured fixture',
        lang: 'en',
        description: 'Structured fixture',
        headings: [],
        lists: [],
        interactives: {
          buttons: [],
          links: [],
          inputs: [],
          selects: [],
          textareas: [],
          checkboxes: [],
        },
        landmarks: {
          forms: [],
          dialogs: [],
          mains: [],
        },
        dialogs: [],
        frames: [],
        shadowHosts: [],
      };
    },
  };

  await captureObservationSnapshot(observationPage);
  await collectStructuredPageData(structuredPage, { detailLevel: 'standard' });

  assert.equal(typeof observationPayload?.interactiveRuntimeSource, 'string');
  assert.equal(observationPayload?.interactiveRuntimeSource.length > 0, true);
  assert.equal(observationPayload?.interactiveRuntimeSource, structuredPayload?.interactiveRuntimeSource);
  assert.equal(typeof observationPayload?.interactiveRuntimeInstantiatorSource, 'string');
  assert.equal(
    observationPayload?.interactiveRuntimeInstantiatorSource,
    structuredPayload?.interactiveRuntimeInstantiatorSource
  );
});

test('shared browser interactive runtime applies the same workflow highValue and priority rules to Continue and Save controls', async () => {
  let observationPayload;
  let structuredPayload;
  const observationPage = {
    async title() {
      return 'Workspace';
    },
    url() {
      return 'https://fixture.local/workspace';
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate(_callback, payload) {
      observationPayload = payload;
      return {
        documentId: 'doc-stable',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 0, inputs: 0, dialogs: 0, links: 0, forms: 0 },
        semanticRaw: createEmptySemanticRaw(),
      };
    },
  };
  const structuredPage = {
    async evaluate(_callback, payload) {
      structuredPayload = payload;
      return {
        title: 'Structured fixture',
        url: 'https://fixture.local/workspace',
        text: 'Structured fixture',
        lang: 'en',
        description: 'Structured fixture',
        headings: [],
        lists: [],
        interactives: {
          buttons: [],
          links: [],
          inputs: [],
          selects: [],
          textareas: [],
          checkboxes: [],
        },
        landmarks: {
          forms: [],
          dialogs: [],
          mains: [],
        },
        dialogs: [],
        frames: [],
        shadowHosts: [],
      };
    },
  };
  const buildRuntime = (payload) => {
    const factory = Function(`return (${payload.interactiveRuntimeSource})`)();
    return factory({ config: payload.interactivePriorityConfig });
  };
  const continueButton = {
    group: 'buttons',
    role: 'button',
    name: 'Continue',
    text: 'Continue',
    label: '',
    visible: true,
    disabled: false,
    withinMain: true,
    withinForm: false,
    withinDialog: false,
    testId: '',
    isSubmitControl: false,
  };
  const saveLink = {
    group: 'links',
    role: 'link',
    name: 'Save changes',
    text: 'Save changes',
    label: '',
    visible: true,
    disabled: false,
    withinMain: true,
    withinForm: false,
    withinDialog: false,
    testId: '',
  };

  await captureObservationSnapshot(observationPage);
  await collectStructuredPageData(structuredPage, { detailLevel: 'standard' });

  const observationRuntime = buildRuntime(observationPayload);
  const structuredRuntime = buildRuntime(structuredPayload);

  assert.equal(observationRuntime.getInteractiveHighValue(continueButton), true);
  assert.equal(structuredRuntime.getInteractiveHighValue(continueButton), true);
  assert.equal(observationRuntime.getInteractivePriorityScore(continueButton), structuredRuntime.getInteractivePriorityScore(continueButton));
  assert.equal(observationRuntime.getInteractiveHighValue(saveLink), true);
  assert.equal(structuredRuntime.getInteractiveHighValue(saveLink), true);
  assert.equal(observationRuntime.getInteractivePriorityScore(saveLink), structuredRuntime.getInteractivePriorityScore(saveLink));
});

test('shared browser interactive runtime normalizes aria-disabled workflow controls consistently', async () => {
  let observationPayload;
  let structuredPayload;
  const observationPage = {
    async title() {
      return 'Workspace';
    },
    url() {
      return 'https://fixture.local/workspace';
    },
    context() {
      return {
        pages: () => [],
      };
    },
    async evaluate(_callback, payload) {
      observationPayload = payload;
      return {
        documentId: 'doc-stable',
        readyState: 'complete',
        textLines: ['Stable workspace'],
        stats: { buttons: 0, inputs: 0, dialogs: 0, links: 0, forms: 0 },
        semanticRaw: createEmptySemanticRaw(),
      };
    },
  };
  const structuredPage = {
    async evaluate(_callback, payload) {
      structuredPayload = payload;
      return {
        title: 'Structured fixture',
        url: 'https://fixture.local/workspace',
        text: 'Structured fixture',
        lang: 'en',
        description: 'Structured fixture',
        headings: [],
        lists: [],
        interactives: {
          buttons: [],
          links: [],
          inputs: [],
          selects: [],
          textareas: [],
          checkboxes: [],
        },
        landmarks: {
          forms: [],
          dialogs: [],
          mains: [],
        },
        dialogs: [],
        frames: [],
        shadowHosts: [],
      };
    },
  };
  const buildRuntime = (payload) => {
    const factory = Function(`return (${payload.interactiveRuntimeSource})`)();
    return factory({ config: payload.interactivePriorityConfig });
  };

  await captureObservationSnapshot(observationPage);
  await collectStructuredPageData(structuredPage, { detailLevel: 'standard' });

  const observationRuntime = buildRuntime(observationPayload);
  const structuredRuntime = buildRuntime(structuredPayload);
  const ariaDisabledContinueButton = {
    group: 'buttons',
    role: 'button',
    name: 'Continue',
    text: 'Continue',
    visible: true,
    disabled: false,
    ariaDisabled: 'true',
    withinMain: true,
  };
  const ariaDisabledSaveLink = {
    group: 'links',
    role: 'link',
    name: 'Save',
    text: 'Save',
    visible: true,
    ariaDisabled: 'true',
    withinMain: true,
  };
  const enabledChromeButton = {
    group: 'buttons',
    role: 'button',
    name: 'Open help',
    text: 'Open help',
    visible: true,
    disabled: false,
    withinHeader: true,
    withinNav: true,
  };

  const observationContinue = observationRuntime.finalizeInteractiveEntry(ariaDisabledContinueButton);
  const structuredContinue = structuredRuntime.finalizeInteractiveEntry(ariaDisabledContinueButton);
  const observationSave = observationRuntime.finalizeInteractiveEntry(ariaDisabledSaveLink);
  const structuredSave = structuredRuntime.finalizeInteractiveEntry(ariaDisabledSaveLink);

  assert.equal(observationContinue.disabled, true);
  assert.equal(structuredContinue.disabled, true);
  assert.equal(observationSave.disabled, true);
  assert.equal(structuredSave.disabled, true);
  assert.equal(
    observationRuntime.compareInteractivePriority(observationContinue, enabledChromeButton),
    structuredRuntime.compareInteractivePriority(structuredContinue, enabledChromeButton)
  );
  assert.equal(
    observationRuntime.compareInteractivePriority(observationSave, enabledChromeButton),
    structuredRuntime.compareInteractivePriority(structuredSave, enabledChromeButton)
  );
});

test('shared browser interactive runtime prioritizes account workflow links over chrome navigation links', async () => {
  const priorityModule = await import('../../scripts/lib/interactive-priority.js');
  const runtime = priorityModule.createInteractivePriorityRuntime({
    config: priorityModule.INTERACTIVE_PRIORITY_CONFIG,
  });
  const accountWorkflowLink = {
    group: 'links',
    role: 'link',
    name: 'Open New Account',
    text: 'Open New Account',
    visible: true,
    disabled: false,
    withinAside: true,
  };
  const chromeLink = {
    group: 'links',
    role: 'link',
    name: 'About Us',
    text: 'About Us',
    visible: true,
    disabled: false,
    withinNav: true,
  };

  assert.equal(runtime.getInteractiveHighValue(accountWorkflowLink), true);
  assert.equal(runtime.getInteractiveHighValue(chromeLink), false);
  assert.equal(runtime.compareInteractivePriority(accountWorkflowLink, chromeLink) < 0, true);
});
