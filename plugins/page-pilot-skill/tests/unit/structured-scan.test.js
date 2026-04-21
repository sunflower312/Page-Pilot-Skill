import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStructuredPageData, enrichScanWithLocatorVerification } from '../../scripts/lib/structured-scan.js';
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

function createInspectablePageLike(fixtureData) {
  const actionableTarget = {
    isVisible: async () => true,
    isEnabled: async () => true,
    isEditable: async () => true,
  };
  const createLocator = (count = 1, target = actionableTarget) => ({
    count: async () => count,
    first() {
      return target;
    },
  });

  return {
    evaluate: async (fn, detailLevel) => fn(detailLevel, fixtureData),
    getByRole() {
      return createLocator();
    },
    getByLabel() {
      return createLocator();
    },
    getByText() {
      return createLocator();
    },
    getByPlaceholder() {
      return createLocator();
    },
    getByTestId() {
      return createLocator();
    },
    locator() {
      return createLocator();
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

function createTargetTextFixtureData() {
  const inputs = Array.from({ length: 7 }, (_, index) => ({
    role: 'textbox',
    name: `Field ${index + 1}`,
    label: `Field ${index + 1}`,
    text: `Field ${index + 1}`,
    placeholder: `Value ${index + 1}`,
    css: `#field-${index + 1}`,
    visible: true,
    highValue: true,
    domIndex: index,
    withinMain: true,
    withinForm: true,
  }));

  inputs.push({
    role: 'textbox',
    name: 'Workspace owner',
    label: 'Workspace owner',
    text: 'Workspace owner',
    description: 'Preferred owner for this workspace',
    placeholder: 'Casey',
    css: '#workspace-owner',
    visible: true,
    highValue: true,
    domIndex: 99,
    withinMain: true,
    withinForm: true,
    localContext: {
      heading: { text: 'Workspace settings', level: 2, css: '#workspace-heading' },
      form: { name: 'workspace-form' },
      landmark: { name: 'main', css: 'main' },
    },
  });

  return {
    title: 'Target text fixture',
    url: 'http://fixture.local/target-text.html',
    text: 'A page with many similar fields and one workspace-specific field.',
    lang: 'en',
    description: 'Target text should pull the matching field into the retained set.',
    headings: [{ level: 1, text: 'Workspace settings', css: 'h1' }],
    lists: [],
    interactives: {
      buttons: [],
      links: [],
      inputs,
      selects: [],
      textareas: [],
      checkboxes: [],
    },
    landmarks: {
      forms: [{ name: 'workspace-form' }],
      dialogs: [],
      mains: [{ name: 'main' }],
    },
    dialogs: [],
    frames: [],
    shadowHosts: [],
  };
}

function createSummaryCoverageFixtureData() {
  return {
    title: 'Coverage fixture',
    url: 'http://fixture.local/coverage.html',
    text: 'Coverage fixture',
    lang: 'en',
    description: 'Counts should align across summary and coverage.',
    headings: [{ level: 1, text: 'Coverage fixture', css: 'h1' }],
    lists: [],
    tables: [{ label: 'queue', headers: ['Ticket'], css: '#queue-table', rowCountEstimate: 4, rowActions: ['Open'] }],
    interactives: {
      buttons: Array.from({ length: 6 }, (_, index) => ({
        role: 'button',
        name: `Action ${index + 1}`,
        text: `Action ${index + 1}`,
        css: `#action-${index + 1}`,
        visible: true,
        highValue: true,
        domIndex: index,
        withinMain: true,
      })),
      links: [],
      inputs: [
        {
          role: 'textbox',
          name: 'Customer name',
          label: 'Customer name',
          text: 'Customer name',
          css: '#customer-name',
          visible: true,
          highValue: true,
          domIndex: 10,
          withinMain: true,
          withinForm: true,
        },
        {
          role: 'textbox',
          name: 'Owner',
          label: 'Owner',
          text: 'Owner',
          css: '#owner',
          visible: true,
          highValue: true,
          domIndex: 11,
          withinMain: true,
          withinForm: true,
        },
      ],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
    specializedControls: {
      radios: [
        {
          role: 'radio',
          name: 'Chat',
          text: 'Chat',
          css: '#radio-chat',
          visible: true,
          highValue: true,
          domIndex: 20,
          withinMain: true,
          withinForm: true,
        },
        {
          role: 'radio',
          name: 'Email',
          text: 'Email',
          css: '#radio-email',
          visible: true,
          highValue: true,
          domIndex: 21,
          withinMain: true,
          withinForm: true,
        },
      ],
      switches: [
        {
          role: 'switch',
          name: 'Escalate case',
          text: 'Escalate case',
          css: '#escalate-switch',
          visible: true,
          highValue: true,
          domIndex: 22,
          withinMain: true,
          withinForm: true,
          checked: true,
        },
      ],
      sliders: [],
      tabs: [],
      options: [],
      menuItems: [],
      fileInputs: [
        {
          role: 'button',
          name: 'Upload evidence',
          text: 'Upload evidence',
          css: '#upload-evidence',
          visible: true,
          highValue: true,
          domIndex: 23,
          withinMain: true,
          withinForm: true,
          controlType: 'file',
        },
      ],
      dateInputs: [
        {
          role: 'textbox',
          name: 'Schedule review',
          text: 'Schedule review',
          css: '#schedule-review',
          visible: true,
          highValue: true,
          domIndex: 24,
          withinMain: true,
          withinForm: true,
          controlType: 'date',
        },
      ],
    },
    discoveredCounts: {
      buttons: 9,
      links: 0,
      inputs: 4,
      selects: 0,
      textareas: 0,
      checkboxes: 0,
      specialized: {
        radios: 3,
        switches: 1,
        sliders: 0,
        tabs: 0,
        options: 0,
        menuItems: 0,
        fileInputs: 2,
        dateInputs: 2,
      },
    },
    landmarks: {
      forms: [{ name: 'support-form' }],
      dialogs: [],
      mains: [{ name: 'main' }],
    },
    dialogs: [],
    frames: [],
    shadowHosts: [],
  };
}

function createVerificationActionFixtureData() {
  return {
    title: 'Verification Action Fixture',
    url: 'http://fixture.local/verification-action.html',
    text: 'A page with multiple control types for scan-time verification.',
    lang: 'en',
    interactives: {
      buttons: [],
      links: [],
      inputs: [],
      selects: [
        {
          role: 'combobox',
          name: 'Priority',
          label: 'Priority',
          labelSource: 'label',
          roleSource: 'native_tag',
          css: '#priority',
          visible: true,
          highValue: true,
          domIndex: 0,
          withinForm: true,
        },
      ],
      textareas: [],
      checkboxes: [],
    },
    specializedControls: {
      radios: [
        {
          role: 'radio',
          name: 'Email',
          label: 'Email',
          labelSource: 'label',
          roleSource: 'aria_role',
          css: '#contact-email',
          visible: true,
          highValue: true,
          domIndex: 1,
          withinForm: true,
        },
      ],
      switches: [],
      sliders: [],
      tabs: [],
      options: [],
      menuItems: [],
      fileInputs: [
        {
          role: 'button',
          name: 'Upload evidence',
          label: 'Upload evidence',
          labelSource: 'label',
          roleSource: 'native_tag',
          css: '#evidence',
          visible: true,
          highValue: true,
          domIndex: 2,
          withinForm: true,
        },
      ],
      dateInputs: [
        {
          role: 'textbox',
          name: 'Schedule review',
          label: 'Schedule review',
          labelSource: 'label',
          roleSource: 'native_tag',
          css: '#schedule-review',
          visible: true,
          highValue: true,
          domIndex: 3,
          withinForm: true,
        },
      ],
    },
    headings: [{ level: 1, text: 'Verification Action Fixture', css: 'h1' }],
    lists: [],
    tables: [],
    landmarks: {
      forms: [{ name: 'verification-form' }],
      dialogs: [],
      mains: [{ name: 'main' }],
    },
    dialogs: [],
    frames: [],
    shadowHosts: [],
  };
}

function createVerificationInspectionFixtureData() {
  return {
    title: 'Verification inspection fixture',
    url: 'http://fixture.local/verification-inspection.html',
    text: 'A hidden test-id button that still verifies through locator inspection.',
    lang: 'en',
    description: 'Verification should reflect locator inspection, not static actionability.',
    headings: [{ level: 1, text: 'Verification inspection fixture', css: 'h1' }],
    lists: [],
    interactives: {
      buttons: [
        {
          role: 'button',
          name: 'Continue',
          text: 'Continue',
          testId: 'hidden-continue',
          css: '#hidden-continue',
          visible: false,
          highValue: true,
          domIndex: 0,
          withinMain: true,
        },
      ],
      links: [],
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
  assert.equal(full.summary.truncated, true);
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

test('collectStructuredPageData prioritizes link primaryAction during scan-time verification', async () => {
  const fixtureData = createLinkPrimaryActionFixtureData();
  const verified = await collectStructuredPageData(createInspectablePageLike(fixtureData), {
    detailLevel: 'brief',
    verification: {
      enabled: true,
      maxPerElement: 1,
      groups: ['buttons'],
    },
  });

  const primaryLink = verified.interactives.links.find((entry) => entry.css === '#resume-plan-link');
  assert.ok(primaryLink);
  assert.equal(primaryLink.recommendedLocators[0].verification.attempted, true);
  assert.equal(primaryLink.recommendedLocators[0].verification.action, 'click');
  assert.equal(primaryLink.recommendedLocators[0].verification.unique, true);
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

test('collectStructuredPageData uses focus.targetText as a real weak ranking signal', async () => {
  const fixtureData = createTargetTextFixtureData();
  const withoutTarget = await collectStructuredPageData(createPageLike(fixtureData), {
    detailLevel: 'brief',
    focus: { kind: 'form_fill' },
  });
  const withTarget = await collectStructuredPageData(createPageLike(fixtureData), {
    detailLevel: 'brief',
    focus: { kind: 'form_fill', targetText: 'workspace' },
  });

  assert.equal(withoutTarget.interactives.inputs.some((entry) => entry.css === '#workspace-owner'), false);
  assert.equal(withTarget.interactives.inputs.some((entry) => entry.css === '#workspace-owner'), true);
  assert.equal(withTarget.focus.targetText, 'workspace');
});

test('collectStructuredPageData aligns summary counts with coverage and specialized controls', async () => {
  const scan = await collectStructuredPageData(createPageLike(createSummaryCoverageFixtureData()), {
    detailLevel: 'brief',
    includeSpecializedControls: true,
  });

  assert.equal(scan.summary.discoveredInteractiveCount, 21);
  assert.equal(scan.summary.retainedInteractiveCount, 11);
  assert.equal(scan.summary.truncated, true);
  assert.equal(scan.summary.coverage.omittedByGroup.buttons, 5);
  assert.equal(scan.summary.coverage.omittedByGroup.specialized.radios, 1);
  assert.equal(scan.summary.coverage.omittedByGroup.specialized.fileInputs, 1);
  assert.equal(scan.summary.coverage.omittedByGroup.specialized.dateInputs, 1);
});

test('collectStructuredPageData excludes specialized retained counts when specialized controls are not returned', async () => {
  const scan = await collectStructuredPageData(createPageLike(createSummaryCoverageFixtureData()), {
    detailLevel: 'brief',
    includeSpecializedControls: false,
  });

  const sumPrimary = (groups) =>
    groups.buttons + groups.links + groups.inputs + groups.selects + groups.textareas + groups.checkboxes;

  assert.deepEqual(scan.specializedControls, {
    radios: [],
    switches: [],
    sliders: [],
    tabs: [],
    options: [],
    menuItems: [],
    fileInputs: [],
    dateInputs: [],
  });
  assert.equal(scan.summary.retainedInteractiveCount, sumPrimary(scan.summary.coverage.retainedByGroup));
  assert.equal(scan.summary.discoveredInteractiveCount, sumPrimary(scan.summary.coverage.discoveredByGroup));
  assert.equal(scan.summary.coverage.retainedByGroup.specialized.radios, 0);
  assert.equal(scan.summary.coverage.retainedByGroup.specialized.fileInputs, 0);
  assert.equal(scan.summary.coverage.retainedByGroup.specialized.dateInputs, 0);
  assert.equal(scan.summary.coverage.discoveredByGroup.specialized.radios, 0);
  assert.equal(scan.summary.coverage.discoveredByGroup.specialized.fileInputs, 0);
  assert.equal(scan.summary.coverage.discoveredByGroup.specialized.dateInputs, 0);
});

test('collectStructuredPageData uses locator inspection results in scan-time verification', async () => {
  const scan = await collectStructuredPageData(
    createRoleFallbackPageLike(createVerificationInspectionFixtureData()),
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
  assert.equal(button.actionability.visible, false);
  assert.equal(button.recommendedLocators[0].verification.attempted, true);
  assert.equal(button.recommendedLocators[0].verification.visible, true);
  assert.equal(button.recommendedLocators[0].verification.enabled, true);
  assert.equal(button.recommendedLocators[0].verification.usable, true);
});

test('collectStructuredPageData assigns scan-time verification actions by control group', async () => {
  const scan = await collectStructuredPageData(createInspectablePageLike(createVerificationActionFixtureData()), {
    detailLevel: 'full',
    includeSpecializedControls: true,
    verification: {
      enabled: true,
      maxPerElement: 1,
      groups: ['selects', 'radios', 'dateInputs', 'fileInputs'],
    },
  });

  assert.equal(scan.interactives.selects[0].recommendedLocators[0].verification.action, 'select');
  assert.equal(scan.specializedControls.radios[0].recommendedLocators[0].verification.action, 'check');
  assert.equal(scan.specializedControls.dateInputs[0].recommendedLocators[0].verification.action, 'fill');
  assert.equal(scan.specializedControls.fileInputs[0].recommendedLocators[0].verification.action, 'set_files');
});

test('enrichScanWithLocatorVerification forwards the expected usage to locator choice verification', async () => {
  const baseScan = await collectStructuredPageData(createPageLike(createVerificationActionFixtureData()), {
    detailLevel: 'full',
    includeSpecializedControls: true,
  });
  const seenUsages = [];

  const verifiedScan = await enrichScanWithLocatorVerification(
    createInspectablePageLike(createVerificationActionFixtureData()),
    baseScan,
    {
      enabled: true,
      maxPerElement: 1,
      groups: ['selects', 'radios', 'dateInputs', 'fileInputs'],
    },
    {
      buildChoices: async (_pageLike, locatorCandidates, usage) => {
        seenUsages.push(usage);
        return locatorCandidates.map((candidate) => {
          const locator = candidate.locator ?? candidate;
          return {
            ...candidate,
            locator,
            locatorType: locator.strategy,
            matchCount: 1,
            playwrightExpression: 'page.locator("mock")',
            inspection: {
              locator,
              count: 1,
              unique: true,
              visible: true,
              enabled: true,
              editable: usage === 'fill',
              actionable: true,
              usable: true,
            },
          };
        });
      },
    }
  );

  assert.equal(seenUsages.includes('select'), true);
  assert.equal(seenUsages.includes('check'), true);
  assert.equal(seenUsages.includes('fill'), true);
  assert.equal(seenUsages.includes('set_files'), true);
  assert.equal(verifiedScan.interactives.selects[0].recommendedLocators[0].verification.action, 'select');
  assert.equal(verifiedScan.specializedControls.radios[0].recommendedLocators[0].verification.action, 'check');
  assert.equal(verifiedScan.specializedControls.dateInputs[0].recommendedLocators[0].verification.action, 'fill');
  assert.equal(verifiedScan.specializedControls.fileInputs[0].recommendedLocators[0].verification.action, 'set_files');
});

test('collectStructuredPageData derives result-region hints from collections and folds specialized controls into formFields', async () => {
  const scan = await collectStructuredPageData(createPageLike(createSummaryCoverageFixtureData()), {
    detailLevel: 'full',
    focus: { kind: 'form_fill' },
    includeSpecializedControls: true,
  });

  assert.deepEqual(scan.hints.possibleResultRegions, [{ kind: 'table', label: 'queue', itemsCount: 4 }]);
  assert.deepEqual(scan.hints.primaryCollection, { kind: 'table', label: 'queue' });
  assert.equal(scan.hints.formFields.some((entry) => entry.kind === 'radios' && entry.label === 'Chat'), true);
  assert.equal(scan.hints.formFields.some((entry) => entry.kind === 'dateInputs' && entry.label === 'Schedule review'), true);
  assert.equal(scan.hints.formFields.some((entry) => entry.kind === 'fileInputs' && entry.label === 'Upload evidence'), true);
  assert.equal(scan.hints.formFields.some((entry) => entry.kind === 'switches' && entry.label === 'Escalate case'), true);
});
