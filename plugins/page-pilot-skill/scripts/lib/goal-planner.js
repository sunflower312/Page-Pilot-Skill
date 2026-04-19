function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lowerText(value) {
  return compactText(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

const CANONICAL_FIELD_ALIASES = {
  email: ['email', 'e-mail', 'mail', '邮箱'],
  password: ['password', 'passcode', 'pass', '密码'],
  otp: ['otp', 'code', 'verification', 'verify', '验证码'],
  search: ['search', 'query', 'lookup', '查找', '搜索'],
  name: ['name', 'username', '用户', '姓名'],
};

const TARGET_KEY_PATTERN = /(module|course|lesson|target|page|section|item|catalog|moduleName)/i;
const CONTINUE_PATTERN = /(continue|resume|start|next|begin|launch|open|learn|study|继续|开始|进入)/i;
const RETURN_PATTERN = /(back|return|catalog|modules|course list|目录|列表|返回)/i;
const DIALOG_PATTERN = /(continue|ok|allow|accept|start|close|dismiss|confirm|继续|开始|确认|关闭)/i;

function normalizeHintEntries(inputHints = {}) {
  return Object.entries(inputHints).map(([key, rawValue]) => ({
    key,
    normalizedKey: lowerText(key),
    value: rawValue,
  }));
}

function extractQuotedPhrases(goal = '') {
  return [...String(goal).matchAll(/["“](.+?)["”]/g)].map((match) => compactText(match[1]));
}

function extractGoalTargetPhrases(goal = '') {
  const source = String(goal);
  const patterns = [
    /(?:进入|打开)\s*([^，。,.]+?)\s*(?:模块|课程|页面|课)/i,
    /(?:open|go to|enter)\s+(.+?)\s+(?:module|course|lesson|page)/i,
  ];

  return unique(
    patterns
      .map((pattern) => source.match(pattern)?.[1] ?? '')
      .map((value) => compactText(value))
      .filter(Boolean)
  );
}

function detectGoalFlags(goal = '') {
  const text = lowerText(goal);
  return {
    authenticate: /(登录|sign in|login|认证|authenticate)/.test(text),
    navigate: /(进入|打开|navigate|go to|course|module|lesson|模块)/.test(text),
    complete: /(学习|learn|study|submit|填写|完成|watch|read|resume|continue|next)/.test(text),
    returnOrContinue: /(返回|回去|back|return|catalog|目录|列表|继续后续|继续下一个|continue after)/.test(text),
  };
}

function normalizeSuccessIndicators(successIndicators = {}) {
  return {
    textIncludes: unique(successIndicators.textIncludes ?? []),
    urlIncludes: unique(successIndicators.urlIncludes ?? []),
    pageTypes: unique(successIndicators.pageTypes ?? []),
  };
}

function buildCanonicalHintMap(entries = []) {
  const map = {};
  const fieldEntries = entries.filter((entry) => !TARGET_KEY_PATTERN.test(entry.key));

  for (const [canonicalKey, aliases] of Object.entries(CANONICAL_FIELD_ALIASES)) {
    const match = fieldEntries.find((entry) => aliases.some((alias) => entry.normalizedKey === alias));
    if (match) {
      map[canonicalKey] = match.value;
    }
  }

  return map;
}

function buildTargetPhrases(goal = '', entries = []) {
  const explicitTargets = entries
    .filter((entry) => TARGET_KEY_PATTERN.test(entry.key))
    .flatMap((entry) => (Array.isArray(entry.value) ? entry.value : [entry.value]))
    .map((value) => compactText(value))
    .filter(Boolean);

  return unique([...explicitTargets, ...extractQuotedPhrases(goal), ...extractGoalTargetPhrases(goal)]);
}

function candidateTexts(entry = {}) {
  return lowerText([entry.name, entry.text, entry.label, entry.placeholder, entry.href, entry.css].join(' '));
}

function toAction(entry, type, extra = {}) {
  return {
    type,
    locator: entry.preferredLocator,
    fallbackLocators: entry.fallbackLocators?.length ? entry.fallbackLocators : undefined,
    ...extra,
  };
}

function actionKey(action = {}) {
  return JSON.stringify([action.type, action.locator ?? null, action.value ?? action.checked ?? null]);
}

function wasTried(history, fingerprint, action) {
  return history.triedByState[fingerprint]?.has(actionKey(action)) ?? false;
}

function locatorMatchesScan(locator, scan = {}) {
  if (!locator) {
    return false;
  }

  const candidates = [
    ...(scan.interactives?.buttons ?? []),
    ...(scan.interactives?.links ?? []),
    ...(scan.interactives?.inputs ?? []),
    ...(scan.interactives?.selects ?? []),
    ...(scan.interactives?.textareas ?? []),
    ...(scan.interactives?.checkboxes ?? []),
  ];

  return candidates.some(
    (entry) =>
      entry.visible !== false &&
      entry.disabled !== true &&
      JSON.stringify(entry.preferredLocator ?? null) === JSON.stringify(locator)
  );
}

function transitionMatchesGoal(transition = {}, goalContext = {}) {
  if ((goalContext.targetPhrases ?? []).length === 0) {
    return true;
  }

  const text = lowerText([
    transition.goal,
    transition.targetSummaryLabel,
    ...(transition.actions ?? []).map((action) => JSON.stringify(action.locator ?? null)),
  ].join(' '));

  return goalContext.targetPhrases.some((phrase) => text.includes(lowerText(phrase)));
}

function chooseLearnedTransition(report = {}, goalContext = {}, history = {}, stateFingerprint = '', phaseId = '', scan = {}) {
  const transitions = report.learnedExperience?.preferredTransitions ?? [];
  for (const transition of transitions) {
    if (transition.phaseId && transition.phaseId !== phaseId) {
      continue;
    }
    if (!transitionMatchesGoal(transition, goalContext)) {
      continue;
    }
    const actions = transition.actions ?? [];
    if (actions.length === 0) {
      continue;
    }
    if (actions.some((action) => action.type !== 'click' || !locatorMatchesScan(action.locator, scan))) {
      continue;
    }
    if (actions.some((action) => wasTried(history, stateFingerprint, action))) {
      continue;
    }
    return actions;
  }
  return null;
}

function scoreEntry(entry, goalContext, history, stateFingerprint, phaseId) {
  const text = candidateTexts(entry);
  let score = 0;

  for (const phrase of goalContext.targetPhrases) {
    if (text.includes(lowerText(phrase))) {
      score += 120;
    }
  }

  if (phaseId === 'return_or_continue' && RETURN_PATTERN.test(text)) {
    score += 100;
  }
  if (phaseId !== 'return_or_continue' && CONTINUE_PATTERN.test(text)) {
    score += 70;
  }
  if (goalContext.intent.returnOrContinue && history.completedPhases.includes('complete_primary_work') && RETURN_PATTERN.test(text)) {
    score += 80;
  }
  if (goalContext.intent.complete && CONTINUE_PATTERN.test(text)) {
    score += 35;
  }
  if (DIALOG_PATTERN.test(text)) {
    score += 20;
  }
  if (entry.highValue) {
    score += 15;
  }
  if (entry.group === 'links' && phaseId === 'navigate_to_target') {
    score += 10;
  }
  if (wasTried(history, stateFingerprint, toAction(entry, 'click'))) {
    score -= 1000;
  }

  return score;
}

function nextPendingPhase(taskPlan = [], completedPhases = []) {
  const available = taskPlan.filter((phase) => phase.id !== 'verify_outcome' && !completedPhases.includes(phase.id));
  return available.find((phase) => phase.status === 'current')?.id ?? available[0]?.id ?? 'complete_primary_work';
}

function collectFieldEntries(scan = {}) {
  return [
    ...(scan.interactives?.inputs ?? []).map((entry) => ({ ...entry, group: 'inputs' })),
    ...(scan.interactives?.selects ?? []).map((entry) => ({ ...entry, group: 'selects' })),
    ...(scan.interactives?.textareas ?? []).map((entry) => ({ ...entry, group: 'textareas' })),
    ...(scan.interactives?.checkboxes ?? []).map((entry) => ({ ...entry, group: 'checkboxes' })),
  ];
}

function lookupFieldHint(field, goalContext) {
  const text = candidateTexts(field);

  for (const [canonicalKey, aliases] of Object.entries(CANONICAL_FIELD_ALIASES)) {
    if (aliases.some((alias) => text.includes(alias)) && goalContext.canonicalHints[canonicalKey] !== undefined) {
      return goalContext.canonicalHints[canonicalKey];
    }
  }

  const direct = goalContext.rawHintEntries.find((entry) => text.includes(entry.normalizedKey));
  if (direct) {
    return direct.value;
  }

  if (text.includes('search') && goalContext.targetPhrases.length > 0) {
    return goalContext.targetPhrases[0];
  }

  return undefined;
}

function fieldSatisfied(field, desiredValue) {
  if (field.group === 'checkboxes') {
    return Boolean(field.checked) === Boolean(desiredValue);
  }
  const currentValue = lowerText(field.value ?? field.selectedText ?? '');
  if (Array.isArray(desiredValue)) {
    return desiredValue.every((value) => currentValue.includes(lowerText(value)));
  }
  return currentValue === lowerText(desiredValue);
}

function fieldRequiresHint(field, pageType = 'unknown') {
  if (field.required === true) {
    return true;
  }
  if (pageType !== 'auth' || field.group === 'textareas') {
    return false;
  }

  const text = candidateTexts(field);
  return ['email', 'password', 'otp', 'name'].some((key) =>
    CANONICAL_FIELD_ALIASES[key].some((alias) => text.includes(alias))
  );
}

function planFieldActions(scan, goalContext, history, stateFingerprint, maxActions, pageType) {
  const fields = collectFieldEntries(scan);
  const actions = [];
  const needsInput = [];

  for (const field of fields) {
    if (!field.preferredLocator || actions.length >= maxActions) {
      continue;
    }

    const desiredValue = lookupFieldHint(field, goalContext);
    if (desiredValue === undefined || desiredValue === '') {
      if (fieldRequiresHint(field, pageType) && !compactText(field.value)) {
        needsInput.push({
          field: field.label || field.name || field.placeholder || 'unknown field',
          locator: field.preferredLocator,
        });
      }
      continue;
    }

    if (fieldSatisfied(field, desiredValue)) {
      continue;
    }

    const action =
      field.group === 'selects'
        ? toAction(field, 'select', { value: desiredValue })
        : field.group === 'checkboxes'
          ? toAction(field, 'check', { checked: Boolean(desiredValue) })
          : toAction(field, 'fill', { value: String(desiredValue) });

    if (!wasTried(history, stateFingerprint, action)) {
      actions.push(action);
    }
  }

  return { actions, needsInput };
}

function chooseInteractiveAction(scan, goalContext, history, stateFingerprint, phaseId) {
  const entries = [
    ...(scan.interactives?.buttons ?? []).map((entry) => ({ ...entry, group: 'buttons' })),
    ...(scan.interactives?.links ?? []).map((entry) => ({ ...entry, group: 'links' })),
  ].filter((entry) => entry.preferredLocator && entry.visible !== false && entry.disabled !== true);

  const ranked = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, goalContext, history, stateFingerprint, phaseId) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.entry ?? null;
}

function chooseDialogAction(scan = {}, goalContext = {}, history = {}, stateFingerprint = '', phaseId = '') {
  const entries = [...(scan.interactives?.buttons ?? []), ...(scan.interactives?.links ?? [])].filter(
    (entry) => entry.preferredLocator && entry.disabled !== true && entry.visible !== false
  );
  const ranked = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, goalContext, history, stateFingerprint, phaseId) }))
    .filter((entry) => DIALOG_PATTERN.test(candidateTexts(entry.entry)) || entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.entry ?? null;
}

export function buildGoalContext({ goal = '', inputHints = {}, successIndicators = {} } = {}) {
  const rawHintEntries = normalizeHintEntries(inputHints);

  return {
    goal,
    intent: detectGoalFlags(goal),
    rawHintEntries,
    canonicalHints: buildCanonicalHintMap(rawHintEntries),
    targetPhrases: buildTargetPhrases(goal, rawHintEntries),
    successIndicators: normalizeSuccessIndicators(successIndicators),
  };
}

export function createGoalHistory() {
  return {
    triedByState: {},
    completedPhases: [],
    successfulSteps: [],
    failures: [],
  };
}

export function recordGoalCycleSuccess(history, { fingerprint, plan, steps = [] } = {}) {
  history.triedByState[fingerprint] ??= new Set();
  for (const action of plan.actions ?? []) {
    history.triedByState[fingerprint].add(actionKey(action));
  }
  if (plan.completesPhase && plan.phaseId && !history.completedPhases.includes(plan.phaseId)) {
    history.completedPhases.push(plan.phaseId);
  }
  history.successfulSteps.push(...steps.filter((step) => step.ok !== false));
  return history;
}

function stateKey(state = {}) {
  return [
    state.pageType,
    state.readiness,
    state.normalizedUrl,
    state.summaryLabel,
    state.activeDialog?.name ?? '',
  ].join('|');
}

function hasMeaningfulObservationChange(observation = {}) {
  return (
    observation.urlChanged === true ||
    observation.titleChanged === true ||
    (observation.newText?.length ?? 0) > 0 ||
    Object.values(observation.domChange ?? {}).some((value) => value !== 0)
  );
}

export function shouldMarkGoalPhaseComplete({ plan = {}, beforeState = {}, afterState = {}, observation = {} } = {}) {
  if (!plan.completesPhase || !plan.phaseId) {
    return false;
  }

  const advanced = hasMeaningfulObservationChange(observation) || stateKey(beforeState) !== stateKey(afterState);

  if (!advanced) {
    return false;
  }

  if (plan.phaseId === 'authenticate') {
    return !['auth', 'form'].includes(afterState.pageType);
  }
  if (plan.phaseId === 'navigate_to_target') {
    return beforeState.normalizedUrl !== afterState.normalizedUrl || beforeState.pageType !== afterState.pageType;
  }
  if (plan.phaseId === 'complete_primary_work') {
    if (['auth', 'form'].includes(afterState.pageType) && afterState.readiness === 'awaiting_input') {
      return false;
    }
    return afterState.readiness !== 'blocked_by_dialog';
  }
  if (plan.phaseId === 'return_or_continue') {
    return afterState.pageType === 'listing' || beforeState.normalizedUrl !== afterState.normalizedUrl;
  }

  return advanced;
}

export function recordGoalCycleFailure(history, { fingerprint, plan, error = null } = {}) {
  history.triedByState[fingerprint] ??= new Set();
  const attemptedCount = Math.max(0, error?.stepIndex ?? (plan.actions?.length ?? 0));
  for (const action of (plan.actions ?? []).slice(0, attemptedCount)) {
    history.triedByState[fingerprint].add(actionKey(action));
  }
  history.failures.push({
    fingerprint,
    phaseId: plan.phaseId,
    error: error?.message ?? 'Unknown goal action failure',
  });
  return history;
}

export function evaluateGoalCompletion({ scan = {}, report = {}, goalContext = {}, history = {} } = {}) {
  const indicators = goalContext.successIndicators ?? {};
  const textCorpus = lowerText([
    scan.title,
    scan.summary?.mainText,
    ...(scan.summary?.headings ?? []).map((entry) => entry.text),
    ...(scan.summary?.dialogs ?? []).map((entry) => `${entry.name} ${entry.text}`),
    ...(scan.summary?.shadowHosts ?? []).map((entry) => entry.text),
  ].join(' '));
  const urlText = String(scan.url ?? '');
  const hasExplicitIndicators = indicators.textIncludes?.length || indicators.urlIncludes?.length || indicators.pageTypes?.length;

  const matched = {
    textIncludes: (indicators.textIncludes ?? []).every((value) => textCorpus.includes(lowerText(value))),
    urlIncludes: (indicators.urlIncludes ?? []).every((value) => urlText.includes(value)),
    pageTypes:
      (indicators.pageTypes ?? []).length === 0 || (indicators.pageTypes ?? []).includes(report.state?.pageType ?? 'unknown'),
  };

  if (hasExplicitIndicators) {
    return {
      completed: matched.textIncludes && matched.urlIncludes && matched.pageTypes,
      matched,
    };
  }

  const requiredPhases = (report.taskPlan ?? [])
    .map((phase) => phase.id)
    .filter((phaseId) => phaseId !== 'verify_outcome');

  return {
    completed: requiredPhases.length > 0 && requiredPhases.every((phaseId) => history.completedPhases.includes(phaseId)),
    matched,
  };
}

export function planGoalCycle({ scan = {}, report = {}, goalContext = {}, history = createGoalHistory(), maxActions = 4 } = {}) {
  const stateFingerprint = report.state?.fingerprint ?? 'unknown-state';
  const phaseId = nextPendingPhase(report.taskPlan, history.completedPhases);

  if (report.state?.readiness === 'blocked_by_dialog') {
    const dialogEntry = chooseDialogAction(scan, goalContext, history, stateFingerprint, phaseId);
    if (dialogEntry) {
      return {
        status: 'ready',
        phaseId,
        completesPhase: false,
        rationale: '当前页面被对话框阻塞，先解除阻塞再继续主流程',
        actions: [toAction(dialogEntry, 'click')],
        needsInput: [],
      };
    }
  }

  if (report.state?.readiness === 'awaiting_input' || report.state?.pageType === 'auth' || report.state?.pageType === 'form') {
    const fieldPlan = planFieldActions(
      scan,
      goalContext,
      history,
      stateFingerprint,
      Math.max(1, maxActions - 1),
      report.state?.pageType
    );
    const primaryAction = scan.hints?.primaryAction?.locator
      ? {
          type: 'click',
          locator: scan.hints.primaryAction.locator,
          fallbackLocators: scan.hints.primaryAction.locators?.slice(1),
        }
      : null;

    if (fieldPlan.needsInput.length > 0) {
      return {
        status: 'needs_input',
        phaseId: phaseId === 'complete_primary_work' ? 'complete_primary_work' : 'authenticate',
        completesPhase: false,
        rationale: '存在关键输入字段但没有可用输入提示，继续自动探索会变成盲填',
        actions: [],
        needsInput: fieldPlan.needsInput,
      };
    }

    if (fieldPlan.actions.length > 0) {
      const actions = [...fieldPlan.actions];
      if (primaryAction && !wasTried(history, stateFingerprint, primaryAction) && actions.length < maxActions) {
        actions.push(primaryAction);
      }
      return {
        status: 'ready',
        phaseId: phaseId === 'complete_primary_work' ? 'complete_primary_work' : 'authenticate',
        completesPhase: true,
        rationale: '当前页面需要先完成输入字段，再提交主动作推进流程',
        actions,
        needsInput: [],
      };
    }

    if (primaryAction && !wasTried(history, stateFingerprint, primaryAction)) {
      return {
        status: 'ready',
        phaseId,
        completesPhase: true,
        rationale: '字段已就绪，继续触发表单主动作',
        actions: [primaryAction],
        needsInput: [],
      };
    }
  }

  const targetPhaseId =
    goalContext.intent.returnOrContinue && history.completedPhases.includes('complete_primary_work')
      ? 'return_or_continue'
      : phaseId;
  const learnedActions = chooseLearnedTransition(report, goalContext, history, stateFingerprint, targetPhaseId, scan);
  if (learnedActions) {
    return {
      status: 'ready',
      phaseId: targetPhaseId,
      completesPhase: targetPhaseId !== 'verify_outcome',
      rationale: '当前状态命中了已学习的成功路径，优先复用已验证动作而不是重新猜测',
      actions: learnedActions,
      needsInput: [],
    };
  }

  const targetEntry = chooseInteractiveAction(scan, goalContext, history, stateFingerprint, targetPhaseId);
  if (targetEntry) {
    return {
      status: 'ready',
      phaseId: targetPhaseId,
      completesPhase: targetPhaseId !== 'verify_outcome',
      rationale: '当前页面存在与目标最匹配的导航或主动作候选，优先推进这一步',
      actions: [toAction(targetEntry, 'click')],
      needsInput: [],
    };
  }

  if (report.state?.primaryAction?.locator) {
    const fallbackAction = {
      type: 'click',
      locator: report.state.primaryAction.locator,
    };
    if (!wasTried(history, stateFingerprint, fallbackAction)) {
      return {
        status: 'ready',
        phaseId,
        completesPhase: false,
        rationale: '没有更强目标匹配项时，回退到页面主动作',
        actions: [fallbackAction],
        needsInput: [],
      };
    }
  }

  return {
    status: 'stalled',
    phaseId,
    completesPhase: false,
    rationale: '当前页面没有找到新的高置信动作，继续盲点的收益低于风险',
    actions: [],
    needsInput: [],
  };
}
