import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStructuredPageData } from '../../scripts/lib/structured-scan.js';
import { buildLocatorCandidates } from '../../scripts/lib/locator-candidates.js';

function createPageLike(fixtureData) {
  return {
    evaluate: async (fn, detailLevel) => fn(detailLevel, fixtureData),
  };
}

function createRoleFallbackPageLike(fixtureData) {
  const actionableTarget = {
    isVisible: async () => true,
    isEnabled: async () => true,
    isEditable: async () => true,
  };
  const inactiveTarget = {
    isVisible: async () => false,
    isEnabled: async () => false,
    isEditable: async () => false,
  };
  const createLocator = (count, target) => ({
    count: async () => count,
    first() {
      return target;
    },
  });

  return {
    evaluate: async (fn, detailLevel) => fn(detailLevel, fixtureData),
    getByRole(_role, options = {}) {
      return options.exact === false ? createLocator(1, actionableTarget) : createLocator(0, inactiveTarget);
    },
    getByLabel() {
      return createLocator(0, inactiveTarget);
    },
    getByText() {
      return createLocator(0, inactiveTarget);
    },
    getByPlaceholder() {
      return createLocator(0, inactiveTarget);
    },
    getByTestId() {
      return createLocator(0, inactiveTarget);
    },
    locator() {
      return createLocator(0, inactiveTarget);
    },
  };
}

function createFixtureData() {
  return {
    title: 'Page Pilot Skill Complex Fixture',
    url: 'http://fixture.local/complex-page.html',
    text:
      'Support workspace for triaging queued requests, routing issues, and validating embedded tools before launch.',
    lang: 'en',
    description: 'Complex structured scan fixture for v2.',
    headings: [
      { level: 1, text: 'Support workspace', css: 'h1' },
      { level: 2, text: 'Queue summary', css: 'h2' },
      { level: 2, text: 'Escalation checklist', css: 'h2:nth-of-type(2)' },
    ],
    lists: [
      { label: 'queue', itemsCount: 3, itemsPreview: ['Billing', 'Login', 'Escalation'], css: '#queue-list' },
      { label: 'steps', itemsCount: 2, itemsPreview: ['Review', 'Reply'], css: '#steps-list' },
    ],
    interactives: {
      buttons: [
        {
          role: 'button',
          name: 'Open workspace',
          text: 'Open workspace',
          testId: 'primary-action',
          css: '#primary-action',
          visible: true,
          highValue: true,
          domIndex: 0,
        },
        {
          role: 'button',
          name: 'Review logs',
          text: 'Review logs',
          css: '#review-logs',
          visible: true,
          highValue: false,
          domIndex: 1,
        },
        {
          role: 'button',
          name: 'Open help',
          text: 'Open help',
          css: '#open-help',
          visible: true,
          highValue: false,
          domIndex: 2,
        },
        {
          role: 'button',
          name: 'Send request',
          text: 'Send request',
          css: 'button[type="submit"]',
          visible: true,
          highValue: true,
          domIndex: 3,
        },
        {
          role: 'button',
          name: 'Do not keep me',
          text: 'Do not keep me',
          css: '#hidden-plain',
          visible: false,
          highValue: false,
          domIndex: 4,
        },
        {
          role: 'button',
          name: 'Hidden test hook',
          text: 'Hidden test hook',
          testId: 'hidden-test-hook',
          css: '#hidden-test-hook',
          visible: false,
          highValue: true,
          domIndex: 5,
        },
      ],
      links: [
        {
          role: 'link',
          name: 'Read more',
          text: 'Read more',
          href: '/next-page.html',
          css: 'a[href="/next-page.html"]',
          visible: true,
          highValue: true,
          domIndex: 6,
        },
        {
          role: 'link',
          name: 'Browse guides',
          text: 'Browse guides',
          href: '/next-page.html#guides',
          css: 'a[href*="guides"]',
          visible: true,
          highValue: true,
          domIndex: 7,
        },
        {
          role: 'link',
          name: 'Frame docs',
          text: 'Frame docs',
          href: '/frame-content.html',
          css: 'a[href="/frame-content.html"]',
          visible: true,
          highValue: true,
          domIndex: 8,
        },
        {
          role: 'link',
          name: 'Escalation policy',
          text: 'Escalation policy',
          href: '/policies/escalation',
          css: 'a[href="/policies/escalation"]',
          visible: true,
          highValue: true,
          domIndex: 9,
        },
      ],
      inputs: [
        {
          role: 'textbox',
          name: 'Email',
          nameSource: 'label',
          label: 'Email',
          labelSource: 'label',
          text: 'Email',
          roleSource: 'native_tag',
          descriptionSource: 'none',
          placeholder: 'email@example.com',
          css: '#email',
          visible: true,
          highValue: true,
          domIndex: 10,
          withinMain: true,
          withinForm: true,
        },
        {
          role: 'textbox',
          name: 'Ticket ID',
          label: 'Ticket ID',
          text: 'Ticket ID',
          placeholder: 'Ticket ID',
          css: '#ticket-id',
          visible: true,
          highValue: true,
          domIndex: 11,
        },
        {
          role: 'searchbox',
          name: 'Search knowledge base',
          label: 'Search knowledge base',
          text: 'Search knowledge base',
          placeholder: 'Search docs',
          css: '#search',
          visible: true,
          highValue: true,
          domIndex: 12,
        },
        {
          role: 'textbox',
          name: 'Team',
          label: 'Team',
          text: 'Team',
          placeholder: 'Operations',
          css: '#team',
          visible: true,
          highValue: true,
          domIndex: 13,
        },
        {
          role: 'textbox',
          name: 'Owner',
          label: 'Owner',
          text: 'Owner',
          placeholder: 'Casey',
          css: '#owner',
          visible: true,
          highValue: true,
          domIndex: 14,
        },
      ],
      selects: [
        {
          role: 'combobox',
          name: 'Topic',
          label: 'Topic',
          css: '#topic',
          visible: true,
          highValue: true,
          domIndex: 15,
        },
        {
          role: 'combobox',
          name: 'Priority',
          label: 'Priority',
          css: '#priority',
          visible: true,
          highValue: true,
          domIndex: 16,
        },
      ],
      textareas: [
        {
          role: 'textbox',
          name: 'Details',
          label: 'Details',
          placeholder: 'Tell us what happened',
          css: '#details',
          visible: true,
          highValue: true,
          domIndex: 17,
        },
      ],
    },
    landmarks: {
      forms: [{ name: 'support-form' }],
      dialogs: [{ name: 'Confirm send' }, { name: 'Keyboard shortcuts' }],
      mains: [{ name: 'main' }],
    },
    dialogs: [
      { name: 'Confirm send', open: true, text: 'Review before sending.', css: '#confirm-dialog' },
      { name: 'Keyboard shortcuts', open: false, text: 'Press slash to search.', css: '#help-dialog' },
    ],
    frames: [
      { name: 'support-frame', title: 'Support frame', src: '/frame-content.html', text: 'Frame content alpha' },
      { name: 'audit-frame', title: 'Audit frame', src: '/audit.html', text: 'Frame content beta' },
    ],
    shadowHosts: [
      { tag: 'section', css: '#shadow-host', text: 'Shadow controls' },
      { tag: 'agent-card', css: 'agent-card', text: 'Second shadow host' },
    ],
  };
}

function createWorkflowPriorityFixtureData() {
  const chromeButtons = Array.from({ length: 12 }, (_, index) => ({
    role: 'button',
    name: `Chrome action ${index + 1}`,
    text: `Chrome action ${index + 1}`,
    css: `#chrome-action-${index + 1}`,
    visible: true,
    highValue: false,
    domIndex: index,
    withinHeader: true,
    withinNav: true,
  }));

  const chromeLinks = Array.from({ length: 6 }, (_, index) => ({
    role: 'link',
    name: `Chrome link ${index + 1}`,
    text: `Chrome link ${index + 1}`,
    href: `/chrome/${index + 1}`,
    css: `#chrome-link-${index + 1}`,
    visible: true,
    highValue: false,
    domIndex: 20 + index,
    withinHeader: true,
    withinNav: true,
  }));

  return {
    title: 'Workflow Priority Fixture',
    url: 'http://fixture.local/workflow-priority.html',
    text: 'A page where chrome buttons appear before the actual workflow actions.',
    lang: 'en',
    description: 'Prioritize real workflow actions over chrome controls.',
    headings: [{ level: 1, text: 'Workflow Priority Fixture', css: 'h1' }],
    lists: [],
    interactives: {
      buttons: [
        ...chromeButtons,
        {
          role: 'button',
          name: 'Start plan',
          text: 'Start plan',
          css: '#start-plan-button',
          visible: true,
          highValue: false,
          domIndex: 40,
          withinMain: true,
        },
        {
          role: 'button',
          name: 'Next',
          text: 'Next',
          css: '#acct-confirmation-next',
          visible: true,
          highValue: false,
          domIndex: 41,
          withinMain: true,
          withinForm: true,
        },
      ],
      links: [
        ...chromeLinks,
        {
          role: 'link',
          name: 'Resume plan',
          text: 'Resume plan',
          href: '/plans/resume',
          css: '#resume-plan-link',
          visible: true,
          highValue: false,
          domIndex: 42,
          withinMain: true,
        },
      ],
      inputs: [
        {
          role: 'textbox',
          name: 'Email',
          label: 'Email',
          text: 'Email',
          placeholder: 'email@example.com',
          css: '#email',
          visible: true,
          highValue: true,
          domIndex: 43,
          withinMain: true,
          withinForm: true,
        },
        {
          role: 'textbox',
          name: 'First name',
          label: 'First name',
          text: 'First name',
          placeholder: 'Casey',
          css: '#first-name',
          visible: true,
          highValue: true,
          domIndex: 44,
          withinMain: true,
          withinForm: true,
        },
      ],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
    landmarks: {
      forms: [{ name: 'signup-step-1' }],
      dialogs: [],
      mains: [{ name: 'main' }],
    },
    dialogs: [],
    frames: [],
    shadowHosts: [],
  };
}

function createDialogPrimaryActionFixtureData() {
  return {
    title: 'Dialog Primary Action Fixture',
    url: 'http://fixture.local/dialog-primary-action.html',
    text: 'A page where an active dialog competes with a background form.',
    lang: 'en',
    description: 'Prefer the active dialog action over the background form action.',
    headings: [{ level: 1, text: 'Dialog Primary Action Fixture', css: 'h1' }],
    lists: [],
    interactives: {
      buttons: [
        {
          role: 'button',
          name: 'Save profile',
          text: 'Save profile',
          css: '#background-save',
          visible: true,
          highValue: true,
          domIndex: 0,
          withinMain: true,
          withinForm: true,
        },
        {
          role: 'button',
          name: 'Cancel',
          text: 'Cancel',
          css: '#dialog-cancel',
          visible: true,
          highValue: true,
          domIndex: 1,
          withinMain: true,
          withinDialog: true,
        },
        {
          role: 'button',
          name: 'Continue',
          text: 'Continue',
          css: '#dialog-continue',
          visible: true,
          highValue: true,
          domIndex: 2,
          withinMain: true,
          withinDialog: true,
        },
      ],
      links: [],
      inputs: [
        {
          role: 'textbox',
          name: 'Email',
          label: 'Email',
          text: 'Email',
          placeholder: 'email@example.com',
          css: '#email',
          visible: true,
          highValue: true,
          domIndex: 3,
          withinMain: true,
          withinForm: true,
        },
      ],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
    landmarks: {
      forms: [{ name: 'profile-form' }],
      dialogs: [{ name: 'Confirm changes' }],
      mains: [{ name: 'main' }],
    },
    dialogs: [{ name: 'Confirm changes', open: true, text: 'Confirm the current step.', css: '#confirm-dialog' }],
    frames: [],
    shadowHosts: [],
  };
}

function createForwardActionPriorityFixtureData() {
  const fillerButtons = Array.from({ length: 10 }, (_, index) => ({
    role: 'button',
    name: `Skip section ${index + 1}`,
    text: `Skip section ${index + 1}`,
    css: `#skip-section-${index + 1}`,
    visible: true,
    highValue: true,
    domIndex: index,
    withinMain: true,
    withinForm: true,
  }));

  return {
    title: 'Forward Action Priority Fixture',
    url: 'http://fixture.local/forward-action-priority.html',
    text: 'A page where cancel and skip compete with next under a tight budget.',
    lang: 'en',
    description: 'Prefer next or continue over cancel or skip.',
    headings: [{ level: 1, text: 'Forward Action Priority Fixture', css: 'h1' }],
    lists: [],
    interactives: {
      buttons: [
        ...fillerButtons,
        {
          role: 'button',
          name: 'Cancel',
          text: 'Cancel',
          css: '#step-cancel',
          visible: true,
          highValue: true,
          domIndex: 20,
          withinMain: true,
          withinForm: true,
        },
        {
          role: 'button',
          name: 'Skip',
          text: 'Skip',
          css: '#step-skip',
          visible: true,
          highValue: true,
          domIndex: 21,
          withinMain: true,
          withinForm: true,
        },
        {
          role: 'button',
          name: 'Next',
          text: 'Next',
          css: '#step-next',
          visible: true,
          highValue: true,
          domIndex: 22,
          withinMain: true,
          withinForm: true,
        },
      ],
      links: [],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
    landmarks: {
      forms: [{ name: 'step-form' }],
      dialogs: [],
      mains: [{ name: 'main' }],
    },
    dialogs: [],
    frames: [],
    shadowHosts: [],
  };
}

function createLinkPrimaryActionFixtureData() {
  const chromeButtons = Array.from({ length: 6 }, (_, index) => ({
    role: 'button',
    name: `Chrome action ${index + 1}`,
    text: `Chrome action ${index + 1}`,
    css: `#link-chrome-action-${index + 1}`,
    visible: true,
    highValue: false,
    domIndex: index,
    withinHeader: true,
    withinNav: true,
  }));

  return {
    title: 'Link Primary Action Fixture',
    url: 'http://fixture.local/link-primary-action.html',
    text: 'A page where the only real workflow entry is a link in main content.',
    lang: 'en',
    description: 'Prefer the workflow link when buttons are only chrome.',
    headings: [{ level: 1, text: 'Link Primary Action Fixture', css: 'h1' }],
    lists: [],
    interactives: {
      buttons: chromeButtons,
      links: [
        {
          role: 'link',
          name: 'Resume plan',
          text: 'Resume plan',
          href: '/plans/resume',
          css: '#resume-plan-link',
          visible: true,
          highValue: false,
          domIndex: 20,
          withinMain: true,
        },
      ],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
    landmarks: {
      forms: [],
      dialogs: [],
      mains: [{ name: 'main' }],
    },
    dialogs: [],
    frames: [],
    shadowHosts: [],
  };
}

test('buildLocatorCandidates returns stable ordered candidates', () => {
  const candidates = buildLocatorCandidates({
    role: 'textbox',
    name: 'Email',
    label: 'Email',
    text: 'Email',
    placeholder: 'email@example.com',
    testId: 'email-input',
    css: '#email',
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.strategy),
    ['role', 'label', 'testId', 'text', 'placeholder', 'css']
  );
  assert.deepEqual(candidates[0].value, { role: 'textbox', name: 'Email', exact: true });
});

test('collectStructuredPageData normalizes v2 structure and detail budgets', async () => {
  const fixtureData = createFixtureData();
  const brief = await collectStructuredPageData(createPageLike(fixtureData), { detailLevel: 'brief' });
  const standard = await collectStructuredPageData(createPageLike(fixtureData), { detailLevel: 'standard' });
  const full = await collectStructuredPageData(createPageLike(fixtureData), { detailLevel: 'full' });

  assert.equal(brief.ok, true);
  assert.equal(brief.title, 'Page Pilot Skill Complex Fixture');
  assert.equal(brief.document.title, 'Page Pilot Skill Complex Fixture');
  assert.equal(brief.document.description, undefined);
  assert.equal(brief.document.dialogs.length, 1);
  assert.equal(brief.document.frames.length, 1);
  assert.equal(brief.document.shadowHosts.length, 1);
  assert.equal(brief.summary.retainedInteractiveCount, 6);
  assert.equal(brief.summary.truncated, true);
  assert.equal(brief.summary.discoveredInteractiveCount, 18);
  assert.equal(brief.summary.headings.length, 3);
  assert.equal(brief.summary.lists.length, 2);
  assert.equal(brief.hints.formFields.length, 2);
  assert.equal(brief.interactives.buttons.some((entry) => entry.name === 'Do not keep me'), false);
  assert.equal(brief.interactives.buttons.some((entry) => entry.testId === 'hidden-test-hook'), true);
  assert.equal(
    brief.interactives.buttons.find((entry) => entry.testId === 'primary-action').locators[0].strategy,
    'role'
  );

  assert.equal(standard.document.description, 'Complex structured scan fixture for v2.');
  assert.equal(standard.document.dialogs.length, 2);
  assert.equal(standard.summary.retainedInteractiveCount, 12);
  assert.equal(standard.summary.truncated, true);
  assert.equal(standard.hints.formFields.length, 4);
  assert.equal(standard.summary.dialogs.length, 2);
  assert.equal(standard.summary.frames.length, 2);

  assert.equal(full.document.description, 'Complex structured scan fixture for v2.');
  assert.equal(full.document.shadowHosts.length, 2);
  assert.equal(full.summary.discoveredInteractiveCount, 18);
  assert.equal(full.summary.retainedInteractiveCount, 17);
  assert.equal(full.summary.truncated, false);
  assert.equal(full.hints.formFields.length, 8);
  assert.equal(full.summary.shadowHosts.length, 2);
  assert.equal(full.summary.headings.length, 3);
  assert.equal(full.summary.lists.length, 2);
  assert.equal(full.interactives.inputs[0].domIndex >= 0, true);
  assert.deepEqual(
    full.interactives.inputs[0].locators.map((candidate) => candidate.strategy),
    ['role', 'label', 'text', 'placeholder', 'css']
  );
  assert.deepEqual(full.hints.primaryAction.locator, {
    strategy: 'role',
    value: { role: 'button', name: 'Send request', exact: true },
  });
  assert.deepEqual(full.hints.possiblePrimaryForm, { name: 'support-form' });
  assert.equal(full.hints.possibleResultRegions.length, 2);
  assert.equal(full.hints.context.hasFrames, true);
  assert.equal(full.hints.context.hasShadowHosts, true);
  assert.equal(full.schemaVersion, 'scan.v3');
  assert.equal(full.focus.kind, 'generic');
  assert.deepEqual(full.document.regions.main, [{ name: 'main' }]);
  assert.deepEqual(full.document.regions.forms, [{ name: 'support-form' }]);
  assert.equal(full.document.regions.shadowRoots[0].css, '#shadow-host');
  assert.equal(full.summary.coverage.discoveredByGroup.buttons >= full.summary.coverage.retainedByGroup.buttons, true);
  assert.equal(full.summary.coverage.omittedByGroup.buttons >= 0, true);
  assert.equal(Array.isArray(full.collections.tables), true);
  assert.equal(full.hints.primaryCollection.kind, 'list');

  const emailField = full.interactives.inputs.find((entry) => entry.css === '#email');
  assert.equal(emailField.accessibleName, 'Email');
  assert.equal(emailField.visibleText, 'Email');
  assert.equal(emailField.description, '');
  assert.deepEqual(emailField.attributes, {
    label: 'Email',
    placeholder: 'email@example.com',
    testId: '',
    inputType: '',
    href: '',
    controlType: '',
  });
  assert.deepEqual(emailField.state, {
    disabled: false,
    required: false,
    readonly: false,
    checked: null,
    selected: null,
    expanded: null,
    pressed: null,
    busy: null,
    value: '',
  });
  assert.deepEqual(emailField.actionability, {
    visible: true,
    enabled: true,
    actionable: true,
    editable: true,
    clickable: false,
    focusable: true,
  });
  assert.deepEqual(emailField.localContext.form, { name: 'support-form' });
  assert.equal(emailField.localContext.dialog, null);
  assert.deepEqual(emailField.provenance, {
    roleSource: 'native_tag',
    nameSource: 'label',
    labelSource: 'label',
    descriptionSource: 'none',
    origin: 'document',
  });
  assert.equal(emailField.origin.fromShadow, false);
  assert.equal(emailField.geometry, null);
  assert.equal(emailField.recommendedLocators[0].locator.strategy, 'role');
  assert.equal(emailField.recommendedLocators[0].confidence, 'high');
  assert.deepEqual(emailField.recommendedLocators[0].reasons, ['semantic_role_name', 'form_scope']);
  assert.equal(emailField.recommendedLocators[emailField.recommendedLocators.length - 1].fallbackReason, 'css_fallback');
  assert.deepEqual(emailField.stableFingerprint, {
    role: 'textbox',
    accessibleName: 'Email',
    description: '',
    testId: '',
    context: {
      withinDialog: false,
      withinForm: true,
      withinMain: true,
    },
  });
  assert.deepEqual(emailField.confidence, {
    level: 'high',
    score: 0.99,
    reasons: ['semantic_role', 'label', 'strong_name_source', 'strong_label_source', 'in_form_context'],
  });
});

test('collectStructuredPageData prioritizes workflow actions over page chrome in standard scans', async () => {
  const fixtureData = createWorkflowPriorityFixtureData();
  const standard = await collectStructuredPageData(createPageLike(fixtureData), { detailLevel: 'standard' });
  const navigationFocused = await collectStructuredPageData(createPageLike(fixtureData), {
    detailLevel: 'brief',
    focus: { kind: 'navigation' },
  });

  assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#start-plan-button'), true);
  assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#acct-confirmation-next'), true);
  assert.equal(standard.interactives.links.some((entry) => entry.css === '#resume-plan-link'), true);
  assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#chrome-action-12'), false);
  assert.equal(standard.interactives.links.some((entry) => entry.css === '#chrome-link-6'), false);
  assert.equal(standard.hints.primaryAction?.label, 'Next');
  assert.equal(navigationFocused.focus.kind, 'navigation');
  assert.equal(navigationFocused.interactives.links.some((entry) => entry.css === '#resume-plan-link'), true);
});

test('collectStructuredPageData prefers the active dialog action over the background form action', async () => {
  const fixtureData = createDialogPrimaryActionFixtureData();
  const standard = await collectStructuredPageData(createPageLike(fixtureData), { detailLevel: 'standard' });

  assert.equal(standard.hints.activeDialog?.name, 'Confirm changes');
  assert.equal(standard.hints.primaryAction?.label, 'Continue');
});

test('collectStructuredPageData keeps forward form actions ahead of cancel and skip under the standard budget', async () => {
  const fixtureData = createForwardActionPriorityFixtureData();
  const standard = await collectStructuredPageData(createPageLike(fixtureData), { detailLevel: 'standard' });

  assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#step-next'), true);
  assert.equal(standard.interactives.buttons.some((entry) => entry.css === '#step-skip'), false);
  assert.equal(standard.hints.primaryAction?.label, 'Next');
});

test('collectStructuredPageData can pick a workflow link as primaryAction when buttons are only chrome', async () => {
  const fixtureData = createLinkPrimaryActionFixtureData();
  const standard = await collectStructuredPageData(createPageLike(fixtureData), { detailLevel: 'standard' });

  assert.equal(standard.interactives.links.some((entry) => entry.css === '#resume-plan-link'), true);
  assert.equal(standard.hints.primaryAction?.label, 'Resume plan');
  assert.deepEqual(standard.hints.primaryAction?.locator, {
    strategy: 'role',
    value: { role: 'link', name: 'Resume plan', exact: true },
  });
});

test('collectStructuredPageData rewrites verified role fallbacks back into scan locators and hints', async () => {
  const scan = await collectStructuredPageData(
    createRoleFallbackPageLike({
      title: 'Role fallback fixture',
      url: 'http://fixture.local/role-fallback.html',
      text: 'Continue to review the request.',
      lang: 'en',
      description: 'Role locator fallback fixture.',
      headings: [{ level: 1, text: 'Role fallback fixture', css: 'h1' }],
      lists: [],
      interactives: {
        buttons: [
          {
            role: 'button',
            name: 'Continue',
            text: 'Continue',
            css: '#continue',
            visible: true,
            highValue: true,
            domIndex: 0,
            withinMain: true,
          },
        ],
        links: [],
        inputs: [],
        selects: [],
        textareas: [],
      },
      landmarks: {
        forms: [],
        dialogs: [],
        mains: [{ name: 'main' }],
      },
      dialogs: [],
      frames: [],
      shadowHosts: [],
    }),
    {
      detailLevel: 'brief',
      verification: {
        enabled: true,
        maxPerElement: 1,
        groups: ['buttons'],
      },
    }
  );

  const button = scan.interactives.buttons[0];
  assert.equal(button.recommendedLocators[0].locator.strategy, 'role');
  assert.equal(button.recommendedLocators[0].locator.value.exact, false);
  assert.equal(button.recommendedLocators[0].playwrightExpression, 'page.getByRole("button", { name: "Continue", exact: false })');
  assert.equal(button.preferredLocator.value.exact, false);
  assert.equal(button.locators[0].value.exact, false);
  assert.equal(scan.hints.primaryAction?.locator?.value?.exact, false);
});
