import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPageStateModel, buildTaskPlan } from '../../scripts/lib/strategy-state.js';
import {
  planGoalCycle,
  buildGoalContext,
  createGoalHistory,
  evaluateGoalCompletion,
  recordGoalCycleFailure,
  recordGoalCycleSuccess,
  shouldMarkGoalPhaseComplete,
} from '../../scripts/lib/goal-planner.js';

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
        {
          label: 'Password',
          locator: { strategy: 'label', value: 'Password' },
          locators: [{ strategy: 'label', value: 'Password' }],
        },
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
      buttons: [
        {
          role: 'button',
          name: 'Sign in',
          text: 'Sign in',
          css: '#sign-in',
          preferredLocator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } },
          fallbackLocators: [{ strategy: 'css', value: '#sign-in' }],
        },
      ],
      links: [],
      inputs: [
        {
          role: 'textbox',
          name: 'Email',
          label: 'Email',
          text: 'Email',
          css: '#email',
          preferredLocator: { strategy: 'label', value: 'Email' },
          fallbackLocators: [{ strategy: 'css', value: '#email' }],
          value: '',
        },
        {
          role: 'textbox',
          name: 'Password',
          label: 'Password',
          text: 'Password',
          css: '#password',
          preferredLocator: { strategy: 'label', value: 'Password' },
          fallbackLocators: [{ strategy: 'css', value: '#password' }],
          value: '',
        },
      ],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };
}

function createListingScan() {
  return {
    title: 'Course catalog',
    url: 'https://learn.example.com/catalog',
    document: { detailLevel: 'standard' },
    summary: {
      mainText: 'Choose a module to continue learning.',
      headings: [{ text: 'My modules' }],
      lists: [{ label: 'modules', itemsCount: 2, itemsPreview: ['React Basics', 'Design Systems'] }],
      dialogs: [],
      frames: [],
      shadowHosts: [],
      retainedInteractiveCount: 6,
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
          href: '/courses/react-basics',
          css: 'a[href="/courses/react-basics"]',
          preferredLocator: { strategy: 'role', value: { role: 'link', name: 'React Basics' } },
          fallbackLocators: [{ strategy: 'css', value: 'a[href="/courses/react-basics"]' }],
        },
        {
          role: 'link',
          name: 'Design Systems',
          text: 'Design Systems',
          href: '/courses/design-systems',
          css: 'a[href="/courses/design-systems"]',
          preferredLocator: { strategy: 'role', value: { role: 'link', name: 'Design Systems' } },
          fallbackLocators: [{ strategy: 'css', value: 'a[href="/courses/design-systems"]' }],
        },
      ],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
  };
}

function createReport(scan) {
  const state = buildPageStateModel(scan);
  return {
    state,
    taskPlan: buildTaskPlan('登录后进入 React Basics 模块并继续学习', state),
    learnedExperience: { stableLocators: [], goalRuns: [] },
  };
}

test('planGoalCycle fills known auth fields and submits the form', () => {
  const scan = createAuthScan();
  const plan = planGoalCycle({
    scan,
    report: createReport(scan),
    goalContext: buildGoalContext({
      goal: '登录后进入 React Basics 模块并继续学习',
      inputHints: {
        email: 'qa@example.com',
        password: 'correct-horse',
      },
    }),
    history: createGoalHistory(),
    maxActions: 4,
  });

  assert.equal(plan.status, 'ready');
  assert.equal(plan.phaseId, 'authenticate');
  assert.deepEqual(
    plan.actions.map((action) => [action.type, action.locator.strategy, action.value ?? action.locator.value?.name ?? null]),
    [
      ['fill', 'label', 'qa@example.com'],
      ['fill', 'label', 'correct-horse'],
      ['click', 'role', 'Sign in'],
    ]
  );
});

test('planGoalCycle returns needs_input when a required auth field has no supplied hint', () => {
  const scan = createAuthScan();
  const plan = planGoalCycle({
    scan,
    report: createReport(scan),
    goalContext: buildGoalContext({
      goal: '登录后进入 React Basics 模块并继续学习',
      inputHints: {
        email: 'qa@example.com',
      },
    }),
    history: createGoalHistory(),
    maxActions: 4,
  });

  assert.equal(plan.status, 'needs_input');
  assert.equal(plan.phaseId, 'authenticate');
  assert.equal(plan.needsInput.length, 1);
  assert.equal(plan.needsInput[0].field, 'Password');
});

test('planGoalCycle picks the target module link on a listing page', () => {
  const scan = createListingScan();
  const plan = planGoalCycle({
    scan,
    report: createReport(scan),
    goalContext: buildGoalContext({
      goal: '登录后进入 React Basics 模块并继续学习',
      inputHints: {
        module: 'React Basics',
      },
    }),
    history: createGoalHistory(),
    maxActions: 2,
  });

  assert.equal(plan.status, 'ready');
  assert.equal(plan.phaseId, 'navigate_to_target');
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].type, 'click');
  assert.equal(plan.actions[0].locator.strategy, 'role');
  assert.deepEqual(plan.actions[0].locator.value, { role: 'link', name: 'React Basics' });
});

test('planGoalCycle extracts a target phrase from the natural-language goal when no input hint is provided', () => {
  const scan = createListingScan();
  const plan = planGoalCycle({
    scan,
    report: {
      state: buildPageStateModel(scan),
      taskPlan: buildTaskPlan('进入 Design Systems 模块并继续学习', buildPageStateModel(scan)),
      learnedExperience: { stableLocators: [], goalRuns: [] },
    },
    goalContext: buildGoalContext({
      goal: '进入 Design Systems 模块并继续学习',
      inputHints: {},
    }),
    history: createGoalHistory(),
    maxActions: 2,
  });

  assert.equal(plan.status, 'ready');
  assert.equal(plan.actions[0].type, 'click');
  assert.deepEqual(plan.actions[0].locator.value, { role: 'link', name: 'Design Systems' });
});

test('planGoalCycle reuses a learned transition for the current state before falling back to generic ranking', () => {
  const scan = createListingScan();
  const state = buildPageStateModel(scan);
  const plan = planGoalCycle({
    scan,
    report: {
      state,
      taskPlan: buildTaskPlan('继续学习当前课程', state),
      learnedExperience: {
        stableLocators: [],
        goalRuns: [],
        preferredTransitions: [
          {
            phaseId: 'navigate_to_target',
            count: 3,
            actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Design Systems' } } }],
            targetPageType: 'learning',
          },
        ],
      },
    },
    goalContext: buildGoalContext({
      goal: '继续学习当前课程',
      inputHints: {},
    }),
    history: createGoalHistory(),
    maxActions: 2,
  });

  assert.equal(plan.status, 'ready');
  assert.equal(plan.actions[0].type, 'click');
  assert.deepEqual(plan.actions[0].locator.value, { role: 'link', name: 'Design Systems' });
});

test('planGoalCycle ignores a learned transition when it conflicts with the current target phrase', () => {
  const scan = createListingScan();
  const state = buildPageStateModel(scan);
  const plan = planGoalCycle({
    scan,
    report: {
      state,
      taskPlan: buildTaskPlan('进入 React Basics 模块', state),
      learnedExperience: {
        stableLocators: [],
        goalRuns: [],
        preferredTransitions: [
          {
            phaseId: 'navigate_to_target',
            count: 5,
            actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'link', name: 'Design Systems' } } }],
            targetPageType: 'learning',
            goal: '进入 Design Systems 模块',
          },
        ],
      },
    },
    goalContext: buildGoalContext({
      goal: '进入 React Basics 模块',
      inputHints: {},
    }),
    history: createGoalHistory(),
    maxActions: 2,
  });

  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.actions[0].locator.value, { role: 'link', name: 'React Basics' });
});

test('planGoalCycle does not block on optional textarea fields', () => {
  const scan = createAuthScan();
  scan.title = 'Request access';
  scan.summary.mainText = 'Fill the required fields to continue.';
  scan.summary.headings = [{ text: 'Request access' }];
  scan.hints.primaryAction = {
    label: 'Submit request',
    locator: { strategy: 'role', value: { role: 'button', name: 'Submit request' } },
    locators: [{ strategy: 'role', value: { role: 'button', name: 'Submit request' } }],
  };
  scan.interactives.buttons = [
    {
      role: 'button',
      name: 'Submit request',
      text: 'Submit request',
      css: '#submit-request',
      preferredLocator: { strategy: 'role', value: { role: 'button', name: 'Submit request' } },
      fallbackLocators: [{ strategy: 'css', value: '#submit-request' }],
    },
  ];
  scan.interactives.inputs = [scan.interactives.inputs[0]];
  scan.hints.formFields = [scan.hints.formFields[0]];
  scan.interactives.textareas = [
    {
      role: 'textbox',
      name: 'Notes (optional)',
      label: 'Notes (optional)',
      css: '#notes',
      preferredLocator: { strategy: 'label', value: 'Notes (optional)' },
      fallbackLocators: [{ strategy: 'css', value: '#notes' }],
      value: '',
      required: false,
    },
  ];
  scan.hints.formFields.push({
    label: 'Notes (optional)',
    kind: 'textareas',
    value: '',
    required: false,
    locator: { strategy: 'label', value: 'Notes (optional)' },
    locators: [{ strategy: 'label', value: 'Notes (optional)' }],
  });

  const plan = planGoalCycle({
    scan,
    report: {
      state: buildPageStateModel(scan),
      taskPlan: buildTaskPlan('填写表单并提交', buildPageStateModel(scan)),
      learnedExperience: { stableLocators: [], goalRuns: [] },
    },
    goalContext: buildGoalContext({
      goal: '填写表单并提交',
      inputHints: { email: 'qa@example.com' },
    }),
    history: createGoalHistory(),
    maxActions: 4,
  });

  assert.equal(plan.status, 'ready');
  assert.equal(plan.needsInput.length, 0);
});

test('evaluateGoalCompletion stays incomplete when auth actions succeed without leaving auth state', () => {
  const scan = createAuthScan();
  const state = buildPageStateModel(scan);
  const report = {
    state,
    taskPlan: buildTaskPlan('登录', state),
  };
  const history = createGoalHistory();
  const plan = {
    phaseId: 'authenticate',
    completesPhase: true,
    actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Sign in' } } }],
  };
  const shouldComplete = shouldMarkGoalPhaseComplete({
    plan,
    beforeState: state,
    afterState: state,
    observation: {
      urlChanged: false,
      titleChanged: false,
      newText: [],
      domChange: { buttons: 0, inputs: 0, dialogs: 0, links: 0, forms: 0 },
    },
  });

  recordGoalCycleSuccess(history, {
    fingerprint: state.fingerprint,
    plan: { ...plan, completesPhase: shouldComplete },
    steps: [],
  });

  const completion = evaluateGoalCompletion({
    scan,
    report,
    goalContext: buildGoalContext({ goal: '登录' }),
    history,
  });

  assert.equal(shouldComplete, false);
  assert.equal(completion.completed, false);
});

test('recordGoalCycleFailure leaves the failed action eligible for retry', () => {
  const scan = createAuthScan();
  const report = createReport(scan);
  const history = createGoalHistory();
  const firstPlan = planGoalCycle({
    scan,
    report,
    goalContext: buildGoalContext({
      goal: '登录后进入 React Basics 模块并继续学习',
      inputHints: {
        email: 'qa@example.com',
        password: 'correct-horse',
      },
    }),
    history,
    maxActions: 4,
  });

  recordGoalCycleFailure(history, {
    fingerprint: report.state.fingerprint,
    plan: firstPlan,
    error: { message: 'first fill failed', stepIndex: 0 },
  });

  const retryPlan = planGoalCycle({
    scan,
    report,
    goalContext: buildGoalContext({
      goal: '登录后进入 React Basics 模块并继续学习',
      inputHints: {
        email: 'qa@example.com',
        password: 'correct-horse',
      },
    }),
    history,
    maxActions: 4,
  });

  assert.equal(retryPlan.status, 'ready');
  assert.equal(retryPlan.actions[0].type, 'fill');
  assert.equal(retryPlan.actions[0].value, 'qa@example.com');
});

test('planGoalCycle does not block on optional name inputs in generic forms', () => {
  const scan = createAuthScan();
  scan.title = 'Profile form';
  scan.summary.mainText = 'Complete your profile to continue.';
  scan.summary.headings = [{ text: 'Profile form' }];
  scan.interactives.buttons = [
    {
      role: 'button',
      name: 'Save profile',
      text: 'Save profile',
      css: '#save-profile',
      preferredLocator: { strategy: 'role', value: { role: 'button', name: 'Save profile' } },
      fallbackLocators: [{ strategy: 'css', value: '#save-profile' }],
    },
  ];
  scan.hints.primaryAction = {
    label: 'Save profile',
    locator: { strategy: 'role', value: { role: 'button', name: 'Save profile' } },
    locators: [{ strategy: 'role', value: { role: 'button', name: 'Save profile' } }],
  };
  scan.interactives.inputs = [
    {
      role: 'textbox',
      name: 'Email',
      label: 'Email',
      text: 'Email',
      css: '#email',
      preferredLocator: { strategy: 'label', value: 'Email' },
      fallbackLocators: [{ strategy: 'css', value: '#email' }],
      value: '',
      required: true,
    },
    {
      role: 'textbox',
      name: 'Name',
      label: 'Name (optional)',
      text: 'Name',
      css: '#name',
      preferredLocator: { strategy: 'label', value: 'Name (optional)' },
      fallbackLocators: [{ strategy: 'css', value: '#name' }],
      value: '',
      required: false,
    },
  ];
  scan.hints.formFields = [
    {
      label: 'Email',
      kind: 'inputs',
      value: '',
      required: true,
      locator: { strategy: 'label', value: 'Email' },
      locators: [{ strategy: 'label', value: 'Email' }],
    },
    {
      label: 'Name (optional)',
      kind: 'inputs',
      value: '',
      required: false,
      locator: { strategy: 'label', value: 'Name (optional)' },
      locators: [{ strategy: 'label', value: 'Name (optional)' }],
    },
  ];

  const state = buildPageStateModel(scan);
  const plan = planGoalCycle({
    scan,
    report: {
      state,
      taskPlan: buildTaskPlan('填写资料并保存', state),
      learnedExperience: { stableLocators: [], goalRuns: [] },
    },
    goalContext: buildGoalContext({
      goal: '填写资料并保存',
      inputHints: { email: 'qa@example.com' },
    }),
    history: createGoalHistory(),
    maxActions: 4,
  });

  assert.equal(plan.status, 'ready');
  assert.equal(plan.needsInput.length, 0);
});

test('evaluateGoalCompletion matches successIndicators against shadow host text', () => {
  const scan = {
    title: 'Shadow lesson',
    url: 'https://learn.example.com/shadow',
    summary: {
      mainText: 'Visible shell only.',
      headings: [{ text: 'Shadow lesson' }],
      dialogs: [],
      shadowHosts: [{ css: '#shadow-host', text: 'FINAL SHADOW' }],
    },
  };
  const report = {
    state: { pageType: 'detail' },
    taskPlan: [],
  };
  const completion = evaluateGoalCompletion({
    scan,
    report,
    goalContext: buildGoalContext({
      goal: '验证 shadow 里的最终文本',
      successIndicators: { textIncludes: ['FINAL SHADOW'] },
    }),
    history: createGoalHistory(),
  });

  assert.equal(completion.completed, true);
});

test('shouldMarkGoalPhaseComplete keeps complete_primary_work incomplete on validation-only form errors', () => {
  const scan = createAuthScan();
  scan.title = 'Profile form';
  scan.summary.mainText = 'Complete the form.';
  scan.summary.headings = [{ text: 'Profile form' }];
  scan.interactives.inputs = [scan.interactives.inputs[0]];
  scan.hints.formFields = [scan.hints.formFields[0]];
  scan.hints.primaryAction = {
    label: 'Save profile',
    locator: { strategy: 'role', value: { role: 'button', name: 'Save profile' } },
    locators: [{ strategy: 'role', value: { role: 'button', name: 'Save profile' } }],
  };
  const formState = buildPageStateModel(scan);
  const shouldComplete = shouldMarkGoalPhaseComplete({
    plan: {
      phaseId: 'complete_primary_work',
      completesPhase: true,
      actions: [{ type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Save profile' } } }],
    },
    beforeState: formState,
    afterState: formState,
    observation: {
      urlChanged: false,
      titleChanged: false,
      newText: ['Email is required'],
      domChange: { buttons: 0, inputs: 0, dialogs: 0, links: 0, forms: 0 },
    },
  });
  const history = createGoalHistory();

  recordGoalCycleSuccess(history, {
    fingerprint: formState.fingerprint,
    plan: {
      phaseId: 'complete_primary_work',
      completesPhase: shouldComplete,
      actions: [],
    },
    steps: [],
  });

  const completion = evaluateGoalCompletion({
    scan,
    report: {
      state: formState,
      taskPlan: buildTaskPlan('填写资料并保存', formState),
    },
    goalContext: buildGoalContext({ goal: '填写资料并保存' }),
    history,
  });

  assert.equal(shouldComplete, false);
  assert.equal(completion.completed, false);
});

test('moduleName target hints do not leak into name form fields', () => {
  const scan = createAuthScan();
  scan.title = 'Profile form';
  scan.summary.mainText = 'Complete your profile to continue.';
  scan.summary.headings = [{ text: 'Profile form' }];
  scan.interactives.inputs = [
    {
      role: 'textbox',
      name: 'Name',
      label: 'Name',
      text: 'Name',
      css: '#name',
      preferredLocator: { strategy: 'label', value: 'Name' },
      fallbackLocators: [{ strategy: 'css', value: '#name' }],
      value: '',
      required: false,
    },
  ];
  scan.hints.formFields = [
    {
      label: 'Name',
      kind: 'inputs',
      value: '',
      required: false,
      locator: { strategy: 'label', value: 'Name' },
      locators: [{ strategy: 'label', value: 'Name' }],
    },
  ];
  scan.interactives.buttons = [
    {
      role: 'button',
      name: 'Save profile',
      text: 'Save profile',
      css: '#save-profile',
      preferredLocator: { strategy: 'role', value: { role: 'button', name: 'Save profile' } },
      fallbackLocators: [{ strategy: 'css', value: '#save-profile' }],
    },
  ];
  scan.hints.primaryAction = {
    label: 'Save profile',
    locator: { strategy: 'role', value: { role: 'button', name: 'Save profile' } },
    locators: [{ strategy: 'role', value: { role: 'button', name: 'Save profile' } }],
  };
  const state = buildPageStateModel(scan);
  const plan = planGoalCycle({
    scan,
    report: {
      state,
      taskPlan: buildTaskPlan('进入 React Basics 模块', state),
      learnedExperience: { stableLocators: [], goalRuns: [] },
    },
    goalContext: buildGoalContext({
      goal: '进入 React Basics 模块',
      inputHints: { moduleName: 'React Basics' },
    }),
    history: createGoalHistory(),
    maxActions: 3,
  });

  assert.equal(plan.actions.some((action) => action.type === 'fill'), false);
});
