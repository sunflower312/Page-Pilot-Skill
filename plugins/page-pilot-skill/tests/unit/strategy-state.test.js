import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPageStateModel,
  buildTaskPlan,
  buildRecoveryPlan,
  suggestNextActions,
} from '../../scripts/lib/strategy-state.js';
import { buildStrategyReport } from '../../scripts/lib/strategy-report.js';
import {
  ensureStrategyMemory,
  recordStateModel,
  recordSuccessfulRun,
  buildLearnedExperience,
  summarizeWorkflow,
} from '../../scripts/lib/workflow-intelligence.js';

function createAuthScan() {
  return {
    title: 'Sign in',
    url: 'https://learn.example.com/login',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Sign in to continue to your course dashboard.',
      headings: [{ text: 'Sign in' }],
      lists: [],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 4,
      truncated: false,
    },
    hints: {
      activeDialog: null,
      formFields: [
        { label: 'Email', locator: { strategy: 'label', value: 'Email' }, locators: [{ strategy: 'label', value: 'Email' }] },
        { label: 'Password', locator: { strategy: 'label', value: 'Password' }, locators: [{ strategy: 'label', value: 'Password' }] },
      ],
      primaryAction: {
        label: 'Sign in',
        locator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } },
        locators: [{ strategy: 'role', value: { role: 'button', name: 'Sign in' } }],
      },
      possiblePrimaryForm: { name: 'login-form' },
      possibleResultRegions: [],
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [{ name: 'Sign in' }],
      links: [{ name: 'Forgot password' }],
      inputs: [{ label: 'Email' }, { label: 'Password' }],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };
}

test('buildPageStateModel identifies auth pages and decomposes login goals', () => {
  const scan = createAuthScan();
  const state = buildPageStateModel(scan);
  const plan = buildTaskPlan('登录后进入课程模块并继续学习', state);
  const suggestions = suggestNextActions(scan, state, plan, { stableLocators: [] });

  assert.equal(state.pageType, 'auth');
  assert.equal(state.readiness, 'awaiting_input');
  assert.equal(state.signals.hasPrimaryAction, true);
  assert.equal(plan.some((phase) => phase.id === 'authenticate'), true);
  assert.equal(plan.some((phase) => phase.id === 'navigate_to_target'), true);
  assert.equal(plan.some((phase) => phase.id === 'complete_primary_work'), true);
  assert.equal(suggestions[0].locator.strategy, 'label');
  assert.match(suggestions[0].rationale, /表单|登录|输入/);
});

test('workflow intelligence stores site experience and compresses successful flows', () => {
  const session = {};
  const scan = createAuthScan();
  const state = buildPageStateModel(scan);
  const memory = ensureStrategyMemory(session);

  recordStateModel(session, state);
  recordSuccessfulRun(session, {
    goal: '登录后进入学习模块并验证页面',
    stateModel: state,
    finalUrl: 'https://learn.example.com/course/intro',
    steps: [
      { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: 'qa@example.com' },
      { type: 'fill', locator: { strategy: 'label', value: 'Password' }, value: 'secret' },
      {
        type: 'click',
        locator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } },
        stability: { settled: true, trigger: 'url_change' },
      },
      {
        type: 'click',
        locator: { strategy: 'text', value: 'Continue module' },
        stability: { settled: true, trigger: 'url_change' },
      },
      { type: 'assert_text', locator: { strategy: 'css', value: '#lesson-title' }, value: 'Lesson 1' },
    ],
  });

  const learned = buildLearnedExperience(session, state);
  const summary = summarizeWorkflow(
    [
      { type: 'fill', locator: { strategy: 'label', value: 'Email' } },
      { type: 'fill', locator: { strategy: 'label', value: 'Password' } },
      {
        type: 'click',
        locator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } },
        stability: { settled: true, trigger: 'url_change' },
      },
      {
        type: 'click',
        locator: { strategy: 'text', value: 'Continue module' },
        stability: { settled: true, trigger: 'url_change' },
      },
      { type: 'assert_text', locator: { strategy: 'css', value: '#lesson-title' }, value: 'Lesson 1' },
    ],
    {
      goal: '登录后进入学习模块并验证页面',
      stateModel: state,
    }
  );
  const recovery = buildRecoveryPlan({
    scan,
    stateModel: state,
    lastFailure: {
      error: { message: 'Unable to resolve a usable locator for this action' },
      action: { type: 'click', locator: { strategy: 'text', value: 'Continue module' } },
    },
    learnedExperience: learned,
  });

  assert.equal(memory.siteKey, 'https://learn.example.com');
  assert.equal(learned.knownStateCount, 1);
  assert.equal(learned.stableLocators.some((entry) => entry.locator.strategy === 'label'), true);
  assert.equal(learned.workflowTemplates.length > 0, true);
  assert.equal(learned.workflowTemplates[0].template.some((step) => step.valueKey === 'password'), true);
  assert.equal(summary.phases.length >= 3, true);
  assert.equal(summary.phases.some((phase) => phase.id === 'authenticate'), true);
  assert.equal(summary.phases.some((phase) => phase.id === 'navigate'), true);
  assert.equal(summary.phases.some((phase) => phase.id === 'verify'), true);
  assert.equal(recovery.suggestions.length > 0, true);
  assert.match(recovery.suggestions[0].rationale, /已学习|弹窗|重试|定位/);
});

test('workflow intelligence redacts sensitive locator text inside stored workflow summaries', () => {
  const session = {};
  const scan = createAuthScan();
  const state = buildPageStateModel(scan);

  recordSuccessfulRun(session, {
    goal: '继续当前流程',
    stateModel: state,
    finalUrl: 'https://learn.example.com/continue',
    steps: [
      {
        type: 'click',
        locator: { strategy: 'role', value: { role: 'button', name: 'Continue as qa@example.com token=secret' } },
      },
    ],
  });

  const serialized = JSON.stringify(session.strategyMemory.workflows[0]);
  assert.equal(serialized.includes('qa@example.com'), false);
  assert.equal(serialized.includes('token=secret'), false);
});

test('buildTaskPlan does not invent a return phase for plain continue-learning goals', () => {
  const scan = {
    title: 'Lesson 1',
    url: 'https://learn.example.com/course/react/lesson-1',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Continue learning this lesson.',
      headings: [{ text: 'Lesson 1' }],
      lists: [],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 2,
      truncated: false,
    },
    hints: {
      activeDialog: null,
      formFields: [],
      primaryAction: {
        label: 'Continue learning',
        locator: { strategy: 'role', value: { role: 'button', name: 'Continue learning' } },
        locators: [{ strategy: 'role', value: { role: 'button', name: 'Continue learning' } }],
      },
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [{ name: 'Continue learning' }],
      links: [],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };

  const state = buildPageStateModel(scan);
  const plan = buildTaskPlan('继续学习当前课程', state);

  assert.equal(plan.some((phase) => phase.id === 'return_or_continue'), false);
});

test('suggestNextActions offers a listing navigation action even when the page has links but no buttons', () => {
  const scan = {
    title: 'Course catalog',
    url: 'https://learn.example.com/catalog',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Select a module to continue learning.',
      headings: [{ text: 'Catalog' }],
      lists: [{ label: 'modules', itemsCount: 2, itemsPreview: ['React Basics', 'Testing 101'] }],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 2,
      truncated: false,
    },
    hints: {
      activeDialog: null,
      formFields: [],
      primaryAction: null,
      possiblePrimaryForm: null,
      possibleResultRegions: [{ label: 'modules', itemsCount: 2 }],
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [],
      links: [
        {
          role: 'link',
          name: 'React Basics',
          text: 'React Basics',
          href: '/course/react',
          preferredLocator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } },
          fallbackLocators: [{ strategy: 'css', value: 'a[href=\"/course/react\"]' }],
        },
      ],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };

  const state = buildPageStateModel(scan);
  const plan = buildTaskPlan('进入 React Basics 模块', state);
  const suggestions = suggestNextActions(scan, state, plan, { stableLocators: [] });

  assert.equal(state.pageType, 'listing');
  assert.equal(suggestions.some((entry) => entry.action === 'open_primary_target'), true);
});

test('buildPageStateModel treats visible dialogs without accessible names as blocking dialogs', () => {
  const scan = {
    title: 'Danger zone',
    url: 'https://learn.example.com/account/delete',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Delete your account.',
      headings: [{ text: 'Delete account' }],
      lists: [],
      dialogs: [{ name: '', text: 'Are you sure you want to continue?' }],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 1,
      truncated: false,
    },
    hints: {
      activeDialog: { name: '', text: 'Are you sure you want to continue?' },
      formFields: [],
      primaryAction: null,
      possiblePrimaryForm: null,
      possibleResultRegions: [],
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [],
      links: [],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };

  const state = buildPageStateModel(scan);

  assert.equal(state.pageType, 'dialog');
  assert.equal(state.readiness, 'blocked_by_dialog');
});

test('suggestNextActions ignores hidden test-id buttons when a visible action exists', () => {
  const scan = {
    title: 'Catalog actions',
    url: 'https://learn.example.com/catalog',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Choose a visible action from the catalog.',
      headings: [{ text: 'Catalog' }],
      lists: [{ label: 'modules', itemsCount: 2, itemsPreview: ['Visible continue', 'Hidden continue'] }],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 2,
      truncated: false,
    },
    hints: {
      activeDialog: null,
      formFields: [],
      primaryAction: null,
      possiblePrimaryForm: null,
      possibleResultRegions: [],
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [
        {
          role: 'button',
          name: 'Hidden continue',
          text: 'Hidden continue',
          testId: 'hidden-continue',
          visible: false,
          preferredLocator: { strategy: 'testId', value: 'hidden-continue' },
          fallbackLocators: [],
        },
        {
          role: 'button',
          name: 'Continue learning',
          text: 'Continue learning',
          visible: true,
          preferredLocator: { strategy: 'role', value: { role: 'button', name: 'Continue learning' } },
          fallbackLocators: [],
        },
      ],
      links: [],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };

    const state = buildPageStateModel(scan);
  const suggestions = suggestNextActions(scan, state, buildTaskPlan('进入目录入口', state), { stableLocators: [] });

  assert.equal(suggestions.length > 0, true);
  assert.deepEqual(suggestions[0].locator.value, { role: 'button', name: 'Continue learning' });
});

test('suggestNextActions exposes a learned path suggestion when the current state has a known successful transition', () => {
  const scan = {
    title: 'Course catalog',
    url: 'https://learn.example.com/catalog',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Return to your last lesson.',
      headings: [{ text: 'Catalog' }],
      lists: [{ label: 'modules', itemsCount: 2, itemsPreview: ['React Basics', 'Design Systems'] }],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 2,
      truncated: false,
    },
    hints: {
      activeDialog: null,
      formFields: [],
      primaryAction: null,
      possiblePrimaryForm: null,
      possibleResultRegions: [{ label: 'modules', itemsCount: 2 }],
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [],
      links: [
        {
          role: 'link',
          name: 'React Basics',
          text: 'React Basics',
          href: '/course/react',
          preferredLocator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } },
          fallbackLocators: [{ strategy: 'css', value: 'a[href=\"/course/react\"]' }],
        },
      ],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };

  const state = buildPageStateModel(scan);
  const suggestions = suggestNextActions(scan, state, buildTaskPlan('继续学习当前课程', state), {
    stableLocators: [],
    preferredTransitions: [
      {
        phaseId: 'navigate_to_target',
        count: 2,
        actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } } }],
        targetPageType: 'learning',
      },
    ],
  });

  assert.equal(suggestions.some((entry) => entry.action === 'reuse_learned_path'), true);
});

test('buildRecoveryPlan redacts sensitive text from last failure summaries', () => {
  const scan = createAuthScan();
  const state = buildPageStateModel(scan);
  const recovery = buildRecoveryPlan({
    scan,
    stateModel: state,
    lastFailure: {
      error: { message: 'Expected Continue as qa@example.com?token=secret to appear' },
      action: { type: 'assert_text', locator: { strategy: 'role', value: { role: 'button', name: 'Continue as qa@example.com' } } },
    },
    learnedExperience: { stableLocators: [] },
  });

  assert.equal(JSON.stringify(recovery).includes('qa@example.com'), false);
  assert.equal(JSON.stringify(recovery).includes('token=secret'), false);
});

test('buildTaskPlan does not invent a navigation phase for same-page feedback goals', () => {
  const scan = {
    title: 'Profile form',
    url: 'https://learn.example.com/profile',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Submit the form and verify the page feedback.',
      headings: [{ text: 'Profile form' }],
      lists: [],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 2,
      truncated: false,
    },
    hints: {
      activeDialog: null,
      formFields: [{ label: 'Name', locator: { strategy: 'label', value: 'Name' }, locators: [] }],
      primaryAction: {
        label: 'Save profile',
        locator: { strategy: 'role', value: { role: 'button', name: 'Save profile' } },
        locators: [],
      },
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [{ name: 'Save profile' }],
      links: [],
      inputs: [{ label: 'Name' }],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };

  const state = buildPageStateModel(scan);
  const plan = buildTaskPlan('填写表单，提交，然后验证页面反馈', state);

  assert.equal(plan.some((phase) => phase.id === 'navigate_to_target'), false);
});

test('buildStrategyReport does not increment learned state counters on repeated read-only calls', () => {
  const session = {};
  const scan = createAuthScan();

  const first = buildStrategyReport({ session, scan, goal: '查看当前状态' });
  const second = buildStrategyReport({ session, scan, goal: '再次查看当前状态' });

  assert.equal(first.learnedExperience.knownStateCount, 0);
  assert.equal(second.learnedExperience.knownStateCount, 0);
});

test('buildStrategyReport keeps the original successful workflow summary instead of rewriting it with the current goal', () => {
  const session = {};
  const originalScan = createAuthScan();
  const originalState = buildPageStateModel(originalScan);

  recordSuccessfulRun(session, {
    goal: '登录后进入学习模块',
    stateModel: originalState,
    finalUrl: 'https://learn.example.com/course/react',
    steps: [
      {
        type: 'click',
        locator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } },
        stability: { settled: true, trigger: 'url_change' },
      },
    ],
  });
  session.lastSuccessfulRun = {
    initialUrl: 'https://learn.example.com/login',
    finalUrl: 'https://learn.example.com/course/react',
    steps: [
      {
        type: 'click',
        locator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } },
        stability: { settled: true, trigger: 'url_change' },
      },
    ],
  };

  const report = buildStrategyReport({
    session,
    scan: {
      title: 'Account settings',
      url: 'https://learn.example.com/settings',
      document: { detailLevel: 'standard' },
      summary: {
        mainText: 'Manage profile and notifications.',
        headings: [{ text: 'Settings' }],
        lists: [],
        dialogs: [],
        frames: [],
        shadowHosts: [],
        retainedInteractiveCount: 1,
        truncated: false,
      },
      hints: {
        activeDialog: null,
        formFields: [],
        primaryAction: null,
        possiblePrimaryForm: null,
        possibleResultRegions: [],
        context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
      },
      interactives: {
        buttons: [],
        links: [],
        inputs: [],
        selects: [],
        textareas: [],
        checkboxes: [],
      },
    },
    goal: '查看设置页面',
  });

  assert.equal(report.workflowSummary.goal, '登录后进入学习模块');
  assert.equal(report.workflowSummary.contextState, 'auth');
});

test('buildPageStateModel does not leak opaque URL payloads into normalizedUrl or fingerprint', () => {
  const scan = {
    title: 'Data preview',
    url: 'data:text/html,<h1>secret@example.com token=abc</h1>',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Preview content.',
      headings: [{ text: 'Preview' }],
      lists: [],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 0,
      truncated: false,
    },
    hints: {
      activeDialog: null,
      formFields: [],
      primaryAction: null,
      possiblePrimaryForm: null,
      possibleResultRegions: [],
      context: { hasFrames: false, hasShadowHosts: false, detailLevel: 'standard' },
    },
    interactives: {
      buttons: [],
      links: [],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };

  const state = buildPageStateModel(scan);

  assert.equal(state.normalizedUrl, 'data://opaque');
  assert.equal(state.fingerprint.includes('secret@example.com'), false);
  assert.equal(state.fingerprint.includes('token=abc'), false);
});
