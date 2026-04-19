function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function siteKeyFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin;
  } catch {
    return 'unknown-site';
  }
}

function trimList(entries = [], limit = 10) {
  return entries.slice(0, limit);
}

function locatorKey(locator, siteKey = '') {
  return JSON.stringify([siteKey, locator ?? null]);
}

function locatorLabel(locator = {}) {
  if (locator.strategy === 'role') {
    return `${locator.value?.name ?? locator.value?.role ?? 'role-locator'}`;
  }
  return String(locator.value ?? locator.strategy ?? 'locator');
}

function keywordText(step = {}) {
  return `${locatorLabel(step.locator)} ${step.value ?? step.key ?? ''}`.toLowerCase();
}

function transitionEntryKey(entry = {}) {
  return JSON.stringify([entry.phaseId ?? '', entry.actions ?? [], entry.targetFingerprint ?? '', entry.targetPageType ?? '']);
}

function workflowEntryKey(entry = {}) {
  return JSON.stringify([entry.siteKey ?? '', entry.goal ?? '', entry.finalUrl ?? '', entry.phases ?? [], entry.template ?? []]);
}

function inferValueKey(locator = {}) {
  const text = locatorLabel(locator).toLowerCase();
  if (/(email|e-mail|mail|邮箱)/.test(text)) {
    return 'email';
  }
  if (/(password|passcode|密码)/.test(text)) {
    return 'password';
  }
  if (/(otp|verification|verify|验证码)/.test(text)) {
    return 'otp';
  }
  if (/(search|query|lookup|搜索|查找)/.test(text)) {
    return 'search';
  }
  if (/(display name|username|name|姓名|用户)/.test(text)) {
    return 'name';
  }
  return null;
}

function sanitizeNarrativeText(value = '') {
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/([?&](?:token|otp|code|password|secret)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b((?:token|otp|code|password|secret)=)[^\s&]+/gi, '$1[redacted]');
}

function sanitizeStoredUrl(url = '') {
  try {
    const parsed = new URL(url);
    if (parsed.origin === 'null') {
      return `${parsed.protocol}//opaque`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return sanitizeNarrativeText(url);
  }
}

function sanitizeLocator(locator = null, { dropIfChanged = false } = {}) {
  if (!locator) {
    return null;
  }

  if (locator.strategy === 'role') {
    const role = sanitizeNarrativeText(locator.value?.role ?? '');
    const name = sanitizeNarrativeText(locator.value?.name ?? '');
    if (dropIfChanged && (role !== locator.value?.role || name !== locator.value?.name)) {
      return null;
    }
    return {
      strategy: 'role',
      value: {
        role,
        name,
      },
    };
  }

  const value = sanitizeNarrativeText(locator.value ?? '');
  if (dropIfChanged && value !== locator.value) {
    return null;
  }
  return {
    strategy: locator.strategy,
    value,
  };
}

function sanitizeStateModel(state = null) {
  if (!state) {
    return state;
  }

  const primaryActionLabel = sanitizeNarrativeText(state.primaryAction?.label ?? '');
  const primaryActionLocator = sanitizeLocator(state.primaryAction?.locator, { dropIfChanged: true });
  return {
    ...state,
    url: state.url ? sanitizeStoredUrl(state.url) : state.url,
    normalizedUrl: state.normalizedUrl ? sanitizeStoredUrl(state.normalizedUrl) : state.normalizedUrl,
    title: sanitizeNarrativeText(state.title ?? ''),
    summaryLabel: sanitizeNarrativeText(state.summaryLabel ?? ''),
    primaryAction:
      primaryActionLabel || primaryActionLocator
        ? {
            label: primaryActionLabel,
            locator: primaryActionLocator,
          }
        : null,
    activeDialog: state.activeDialog
      ? {
          name: sanitizeNarrativeText(state.activeDialog.name ?? ''),
          text: sanitizeNarrativeText(state.activeDialog.text ?? ''),
        }
      : state.activeDialog,
  };
}

function sanitizeRecordedStep(step = {}) {
  const sanitized = { type: step.type };
  const safeLocator = sanitizeLocator(step.locator, { dropIfChanged: true });
  if (safeLocator) {
    sanitized.locator = safeLocator;
  }
  if (step.waitUntil) {
    sanitized.waitUntil = step.waitUntil;
  }
  if (step.stability?.trigger) {
    sanitized.stability = { trigger: step.stability.trigger };
  }
  if (step.checked !== undefined) {
    sanitized.checked = step.checked;
  }

  if (step.type === 'fill' || step.type === 'select') {
    const valueKey = inferValueKey(step.locator);
    if (valueKey) {
      sanitized.valueKey = valueKey;
    }
    return sanitized;
  }

  if (step.type === 'press' || step.type === 'wait_for') {
    sanitized.value = step.value;
    return sanitized;
  }
  if (step.type === 'navigate') {
    sanitized.url = sanitizeStoredUrl(step.url);
    return sanitized;
  }
  if (step.type === 'assert_url') {
    sanitized.value = sanitizeStoredUrl(step.value);
    return sanitized;
  }
  if (step.type === 'assert_text') {
    sanitized.assertion = 'text_contains';
    return sanitized;
  }

  return sanitized;
}

function buildWorkflowTemplate(steps = []) {
  return steps.map((step) => sanitizeRecordedStep(step));
}

function mergeUniqueEntries(currentEntries = [], incomingEntries = [], getKey) {
  const merged = [];
  const seen = new Set();

  for (const entry of [...incomingEntries, ...currentEntries]) {
    const key = getKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

function classifyStep(step = {}) {
  const text = keywordText(step);
  if (step.type === 'navigate' || step.stability?.trigger === 'url_change') {
    return { id: 'navigate', label: '页面跳转' };
  }
  if (step.type === 'assert_text' || step.type === 'assert_url' || step.type === 'capture') {
    return { id: 'verify', label: '验证结果' };
  }
  if (step.type === 'fill' || step.type === 'select' || step.type === 'check') {
    return /(password|sign in|login|otp|verification)/.test(text)
      ? { id: 'authenticate', label: '完成认证' }
      : { id: 'complete_form', label: '填写表单' };
  }
  if (step.type === 'click' && /(sign in|login|log in|otp|verification)/.test(text)) {
    return { id: 'authenticate', label: '完成认证' };
  }
  if (step.type === 'click' && /(submit|send|save|confirm)/.test(text)) {
    return { id: 'complete_form', label: '提交表单' };
  }
  return { id: 'interact', label: '执行交互' };
}

function mergeStepIntoPhases(phases, step) {
  const classification = classifyStep(step);
  const current = phases[phases.length - 1];
  if (current?.id === classification.id) {
    current.steps.push(step);
    current.stepCount += 1;
    return;
  }

  phases.push({
    id: classification.id,
    label: classification.label,
    stepCount: 1,
    steps: [step],
  });
}

function compactPhase(phase = {}) {
  return {
    id: phase.id,
    label: phase.label,
    stepCount: phase.stepCount,
    locatorLabels: trimList(
      phase.steps
        .map((step) => sanitizeNarrativeText(locatorLabel(step.locator)))
        .filter(Boolean),
      3
    ),
    actionTypes: phase.steps.map((step) => step.type),
  };
}

function buildWorkflowEntry({ goal = '', finalUrl = null, siteKey = '', steps = [], summary = null } = {}) {
  return {
    siteKey: siteKey || siteKeyFromUrl(finalUrl || ''),
    goal: goal ? sanitizeNarrativeText(goal) : undefined,
    finalUrl: finalUrl ? sanitizeStoredUrl(finalUrl) : finalUrl,
    stepCount: steps.length,
    phases: summary?.phases ?? [],
    template: buildWorkflowTemplate(steps),
  };
}

function flattenTransitions(memory = {}) {
  return Object.entries(memory.transitions ?? {}).flatMap(([fromFingerprint, entries]) =>
    (entries ?? []).map((entry) => ({
      ...entry,
      fromFingerprint,
    }))
  );
}

function buildStableLocators(memory = {}) {
  return trimList(
    Object.values(memory.locatorStats ?? {})
      .map((entry) => ({
        ...entry,
        locator: sanitizeLocator(entry.locator, { dropIfChanged: true }),
        label: sanitizeNarrativeText(entry.label),
      }))
      .filter((entry) => entry.locator)
      .sort((left, right) => right.count - left.count)
      .map((entry) => ({
        locator: entry.locator,
        label: entry.label,
        count: entry.count,
        actionTypes: entry.actionTypes,
      })),
    5
  );
}

function buildWorkflowTemplates(memory = {}, limit = 3) {
  return trimList(
    (memory.workflows ?? []).map((workflow) => ({
      goal: workflow.goal,
      finalUrl: workflow.finalUrl,
      stepCount: workflow.stepCount,
      phases: workflow.phases,
      template: workflow.template,
    })),
    limit
  );
}

function buildMatchedState(memory = {}, stateModel = null) {
  if (!stateModel) {
    return null;
  }
  const matchedState = memory.states?.[stateModel.fingerprint] ?? null;
  if (!matchedState) {
    return null;
  }
  return {
    fingerprint: matchedState.fingerprint,
    pageType: matchedState.pageType,
    seenCount: matchedState.seenCount,
    readiness: matchedState.readiness,
  };
}

function activeSiteKey(session = {}, stateModel = null) {
  return siteKeyFromUrl(stateModel?.url ?? session.url ?? session.page?.url?.());
}

function siteKeyForStateModel(stateModel = null) {
  return siteKeyFromUrl(stateModel?.url ?? '');
}

function filterStatesBySite(states = {}, siteKey = '') {
  return Object.fromEntries(Object.entries(states).filter(([, state]) => state.siteKey === siteKey));
}

function filterEntriesBySite(entries = [], siteKey = '') {
  return entries.filter((entry) => entry.siteKey === siteKey);
}

function createEmptyStrategyMemory(url = '') {
  return {
    version: 2,
    siteKey: siteKeyFromUrl(url),
    states: {},
    locatorStats: {},
    workflows: [],
    goalRuns: [],
    failures: [],
    transitions: {},
    lastStateModel: null,
    lastStateModelBySite: {},
  };
}

export function summarizeWorkflow(steps = [], { goal = '', stateModel = null } = {}) {
  const phases = [];
  for (const step of steps) {
    mergeStepIntoPhases(phases, step);
  }

  return {
    goal: goal || undefined,
    contextState: stateModel?.pageType ?? null,
    stepCount: steps.length,
    phases: phases.map((phase) => compactPhase(phase)),
  };
}

export function ensureStrategyMemory(session = {}) {
  session.strategyMemory ??= {};
  Object.assign(session.strategyMemory, {
    ...createEmptyStrategyMemory(session.url ?? session.page?.url?.()),
    ...session.strategyMemory,
    states: session.strategyMemory.states ?? {},
    locatorStats: session.strategyMemory.locatorStats ?? {},
    workflows: session.strategyMemory.workflows ?? [],
    goalRuns: session.strategyMemory.goalRuns ?? [],
    failures: session.strategyMemory.failures ?? [],
    transitions: session.strategyMemory.transitions ?? {},
    lastStateModel: session.strategyMemory.lastStateModel ?? null,
    lastStateModelBySite: session.strategyMemory.lastStateModelBySite ?? {},
  });
  return session.strategyMemory;
}

export function mergeStrategyMemory(session = {}, incomingMemory = null) {
  const memory = ensureStrategyMemory(session);
  if (!incomingMemory) {
    return memory;
  }

  const incoming = {
    ...createEmptyStrategyMemory(session.url ?? session.page?.url?.()),
    ...incomingMemory,
    states: incomingMemory.states ?? {},
    locatorStats: incomingMemory.locatorStats ?? {},
    workflows: incomingMemory.workflows ?? [],
    goalRuns: incomingMemory.goalRuns ?? [],
    failures: incomingMemory.failures ?? [],
    transitions: incomingMemory.transitions ?? {},
  };

  memory.siteKey = incoming.siteKey || memory.siteKey;

  for (const [fingerprint, state] of Object.entries(incoming.states)) {
    const current = memory.states[fingerprint] ?? null;
    memory.states[fingerprint] = current
      ? {
          ...current,
          ...state,
          seenCount: (current.seenCount ?? 0) + (state.seenCount ?? 0),
        }
      : state;
  }

  for (const [key, locator] of Object.entries(incoming.locatorStats)) {
    const current = memory.locatorStats[key] ?? null;
    memory.locatorStats[key] = current
      ? {
          ...current,
          ...locator,
          count: (current.count ?? 0) + (locator.count ?? 0),
          actionTypes: trimList([...new Set([...(current.actionTypes ?? []), ...(locator.actionTypes ?? [])])], 5),
        }
      : locator;
  }

  memory.workflows = trimList(mergeUniqueEntries(memory.workflows, incoming.workflows, workflowEntryKey), 10);
  memory.goalRuns = trimList(
    mergeUniqueEntries(memory.goalRuns, incoming.goalRuns, (entry) =>
      JSON.stringify([entry.goal ?? '', entry.status ?? '', entry.finalUrl ?? '', entry.stepCount ?? 0])
    ),
    10
  );
  memory.failures = trimList(
    mergeUniqueEntries(memory.failures, incoming.failures, (entry) =>
      JSON.stringify([entry.message ?? '', entry.code ?? '', locatorKey(entry.locator)])
    ),
    10
  );

  for (const [fingerprint, entries] of Object.entries(incoming.transitions)) {
    const merged = mergeUniqueEntries(memory.transitions[fingerprint] ?? [], entries ?? [], transitionEntryKey).map((entry) => {
      const duplicate = (memory.transitions[fingerprint] ?? []).find((current) => transitionEntryKey(current) === transitionEntryKey(entry));
      if (!duplicate) {
        return entry;
      }
      return {
        ...duplicate,
        ...entry,
        count: (duplicate.count ?? 0) + (entry.count ?? 0),
      };
    });
    memory.transitions[fingerprint] = trimList(
      merged.sort((left, right) => (right.count ?? 0) - (left.count ?? 0)),
      10
    );
  }

  if (incoming.lastStateModel) {
    memory.lastStateModel = incoming.lastStateModel;
  }
  for (const [siteKey, stateModel] of Object.entries(incoming.lastStateModelBySite ?? {})) {
    memory.lastStateModelBySite[siteKey] = stateModel;
  }
  const incomingLastStateSiteKey = incoming.siteKey || siteKeyForStateModel(incoming.lastStateModel);
  if (incoming.lastStateModel && incomingLastStateSiteKey) {
    memory.lastStateModelBySite[incomingLastStateSiteKey] = incoming.lastStateModel;
  }

  return memory;
}

export function recordStateModel(session = {}, stateModel = null) {
  if (!stateModel) {
    return null;
  }

  const currentSiteKey = activeSiteKey(session, stateModel);
  const memory = ensureStrategyMemory(session);
  const existing = memory.states[stateModel.fingerprint] ?? {
    fingerprint: stateModel.fingerprint,
    pageType: stateModel.pageType,
    summaryLabel: stateModel.summaryLabel,
    seenCount: 0,
  };

  memory.siteKey = currentSiteKey;
  memory.states[stateModel.fingerprint] = {
    ...existing,
    siteKey: currentSiteKey,
    pageType: stateModel.pageType,
    summaryLabel: stateModel.summaryLabel,
    lastSeenUrl: stateModel.url,
    readiness: stateModel.readiness,
    seenCount: existing.seenCount + 1,
  };
  memory.lastStateModel = stateModel;
  memory.lastStateModelBySite[currentSiteKey] = stateModel;
  return memory.states[stateModel.fingerprint];
}

function recordLocator(memory, step, stateFingerprint, siteKey = memory.siteKey) {
  if (!step?.locator) {
    return;
  }

  const key = locatorKey(step.locator, siteKey);
  const current = memory.locatorStats[key] ?? {
    locator: step.locator,
    label: locatorLabel(step.locator),
    count: 0,
    actionTypes: [],
    lastStateFingerprint: null,
  };

  memory.locatorStats[key] = {
    ...current,
    siteKey,
    count: current.count + 1,
    actionTypes: trimList([...new Set([...current.actionTypes, step.type])], 5),
    lastStateFingerprint: stateFingerprint,
  };
}

export function recordSuccessfulRun(
  session = {},
  { goal = '', stateModel = null, initialUrl = null, finalUrl = null, steps = [] } = {}
) {
  const memory = ensureStrategyMemory(session);
  const runSiteKey = siteKeyFromUrl(
    initialUrl || stateModel?.url || finalUrl || session.url || session.page?.url?.()
  );
  if (stateModel) {
    recordStateModel(session, stateModel);
  }

  for (const step of steps) {
    recordLocator(memory, step, stateModel?.fingerprint ?? null, runSiteKey);
  }

  const summary = summarizeWorkflow(steps, { goal, stateModel });
  const workflowEntry = buildWorkflowEntry({ goal, finalUrl, siteKey: runSiteKey, steps, summary });
  memory.workflows = trimList(
    [workflowEntry, ...memory.workflows.filter((entry) => workflowEntryKey(entry) !== workflowEntryKey(workflowEntry))],
    10
  );
  session.lastWorkflowSummary = summary;
  session.lastActionFailure = null;
  return summary;
}

export function recordFailureRun(session = {}, { error = null, action = null, stateModel = null } = {}) {
  const memory = ensureStrategyMemory(session);
  const currentSiteKey = activeSiteKey(session, stateModel);
  if (stateModel) {
    recordStateModel(session, stateModel);
  }

  const failure = {
    siteKey: currentSiteKey,
    message: action?.type ? `${action.type} failed` : 'Action failed',
    code: error?.code ?? null,
    actionType: action?.type ?? null,
    locator: action?.locator ?? null,
    stateFingerprint: stateModel?.fingerprint ?? null,
  };
  memory.failures = trimList([failure, ...memory.failures], 10);
  session.lastActionFailure = { error, action, stateFingerprint: failure.stateFingerprint };
  return failure;
}

export function recordGoalRun(
  session = {},
  {
    goal = '',
    status = 'stalled',
    completed = false,
    cycleCount = 0,
    finalUrl = null,
    stateModel = null,
    workflowSummary = null,
  } = {}
) {
  const memory = ensureStrategyMemory(session);
  const currentSiteKey = activeSiteKey(session, stateModel);

  memory.goalRuns = trimList(
    [
      {
        siteKey: currentSiteKey,
        goal: goal ? sanitizeNarrativeText(goal) : undefined,
        status,
        completed,
        cycleCount,
        finalUrl: finalUrl ? sanitizeStoredUrl(finalUrl) : finalUrl,
        pageType: stateModel?.pageType ?? null,
        phases: workflowSummary?.phases ?? [],
        stepCount: workflowSummary?.stepCount ?? 0,
      },
      ...memory.goalRuns,
    ],
    10
  );

  return memory.goalRuns[0];
}

export function recordStateTransition(
  session = {},
  { fromState = null, toState = null, phaseId = '', actions = [], goal = '' } = {}
) {
  if (!fromState?.fingerprint || actions.length === 0) {
    return null;
  }

  const memory = ensureStrategyMemory(session);
  const currentSiteKey = activeSiteKey(session, fromState);
  recordStateModel(session, fromState);
  if (toState?.fingerprint && toState.fingerprint !== fromState.fingerprint) {
    recordStateModel(session, toState);
  }
  const transition = {
    siteKey: currentSiteKey,
    phaseId,
    actions: buildWorkflowTemplate(actions),
    count: 1,
    targetFingerprint: toState?.fingerprint ?? null,
    targetPageType: toState?.pageType ?? null,
    targetSummaryLabel: toState?.summaryLabel ?? '',
    goal: goal ? sanitizeNarrativeText(goal) : undefined,
  };
  const entries = memory.transitions[fromState.fingerprint] ?? [];
  const existing = entries.find((entry) => transitionEntryKey(entry) === transitionEntryKey(transition));
  if (existing) {
    existing.count += 1;
    existing.targetFingerprint = transition.targetFingerprint;
    existing.targetPageType = transition.targetPageType;
    existing.targetSummaryLabel = transition.targetSummaryLabel;
    existing.goal = transition.goal;
  } else {
    entries.push(transition);
  }

  memory.transitions[fromState.fingerprint] = trimList(
    entries.sort((left, right) => (right.count ?? 0) - (left.count ?? 0)),
    10
  );

  return transition;
}

export function buildLearnedExperience(session = {}, stateModel = null) {
  const memory = ensureStrategyMemory(session);
  const currentSiteKey = activeSiteKey(session, stateModel);
  const matchedState = buildMatchedState(memory, stateModel);
  const siteStates = filterStatesBySite(memory.states, currentSiteKey);

  return {
    siteKey: currentSiteKey,
    knownStateCount: Object.keys(siteStates).length,
    matchedState,
    stableLocators: buildStableLocators({ ...memory, locatorStats: Object.fromEntries(
      Object.entries(memory.locatorStats ?? {}).filter(([, entry]) => entry.siteKey === currentSiteKey)
    ) }),
    recentFailures: trimList(filterEntriesBySite(memory.failures, currentSiteKey).map((entry) => ({
      ...entry,
      locator: sanitizeLocator(entry.locator, { dropIfChanged: false }),
    })), 3),
    goalRuns: trimList(
      filterEntriesBySite(memory.goalRuns, currentSiteKey).map((entry) => ({
        goal: entry.goal,
        status: entry.status,
        completed: entry.completed,
        cycleCount: entry.cycleCount,
        finalUrl: entry.finalUrl,
        pageType: entry.pageType,
        phases: entry.phases,
        stepCount: entry.stepCount,
      })),
      3
    ),
    workflows: trimList(
      filterEntriesBySite(memory.workflows, currentSiteKey).map((workflow) => ({
        goal: workflow.goal,
        stepCount: workflow.stepCount,
        phases: workflow.phases,
        finalUrl: workflow.finalUrl,
      })),
      3
    ),
    workflowTemplates: buildWorkflowTemplates({ ...memory, workflows: filterEntriesBySite(memory.workflows, currentSiteKey) }),
    preferredTransitions: trimList(
      (stateModel ? memory.transitions[stateModel.fingerprint] ?? [] : [])
        .filter((entry) => entry.siteKey === currentSiteKey)
        .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))
        .map((entry) => ({
          phaseId: entry.phaseId,
          count: entry.count,
          actions: entry.actions,
          targetPageType: entry.targetPageType,
          targetFingerprint: entry.targetFingerprint,
          targetSummaryLabel: entry.targetSummaryLabel,
          goal: entry.goal,
        })),
      3
    ),
  };
}

export function buildSiteProfile(session = {}, stateModel = null) {
  const memory = ensureStrategyMemory(session);
  const currentSiteKey = activeSiteKey(session, stateModel);
  const siteStates = filterStatesBySite(memory.states, currentSiteKey);
  const transitions = stateModel?.fingerprint
    ? memory.transitions[stateModel.fingerprint] ?? []
    : flattenTransitions(memory).filter((entry) => entry.siteKey === currentSiteKey);

  return {
    key: currentSiteKey,
    knownStateCount: Object.keys(siteStates).length,
    workflowTemplateCount: filterEntriesBySite(memory.workflows, currentSiteKey).length,
    transitionCount: flattenTransitions(memory).filter((entry) => entry.siteKey === currentSiteKey).length,
    matchedState: buildMatchedState(memory, stateModel),
    workflowTemplates: buildWorkflowTemplates({ ...memory, workflows: filterEntriesBySite(memory.workflows, currentSiteKey) }, 5),
    transitions: trimList(
      transitions
        .filter((entry) => entry.siteKey === currentSiteKey)
        .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))
        .map((entry) => ({
          fromFingerprint: entry.fromFingerprint,
          phaseId: entry.phaseId,
          count: entry.count,
          actions: entry.actions,
          targetPageType: entry.targetPageType,
          targetFingerprint: entry.targetFingerprint,
          targetSummaryLabel: sanitizeNarrativeText(entry.targetSummaryLabel),
          goal: entry.goal,
        })),
      5
    ),
    stableLocators: buildStableLocators({ ...memory, locatorStats: Object.fromEntries(
      Object.entries(memory.locatorStats ?? {}).filter(([, entry]) => entry.siteKey === currentSiteKey)
    ) }),
    recentFailures: trimList(
      filterEntriesBySite(memory.failures, currentSiteKey).map((entry) => ({
        ...entry,
        locator: sanitizeLocator(entry.locator, { dropIfChanged: false }),
      })),
      5
    ),
    goalRuns: trimList(filterEntriesBySite(memory.goalRuns, currentSiteKey), 5),
  };
}

function selectLastStateModelForSite(memory = {}, siteKey = '') {
  if (memory.lastStateModelBySite?.[siteKey]) {
    return memory.lastStateModelBySite[siteKey];
  }
  const fallback = memory.lastStateModel ?? null;
  return siteKeyForStateModel(fallback) === siteKey ? fallback : null;
}

export function buildSiteScopedStrategyMemory(session = {}, siteKey = activeSiteKey(session)) {
  const sourceMemory = ensureStrategyMemory(session);
  const memory = structuredClone(sourceMemory);
  memory.states = filterStatesBySite(memory.states, siteKey);
  memory.locatorStats = Object.fromEntries(
    Object.entries(memory.locatorStats ?? {}).filter(([, entry]) => entry.siteKey === siteKey)
  );
  memory.workflows = filterEntriesBySite(memory.workflows, siteKey);
  memory.goalRuns = filterEntriesBySite(memory.goalRuns, siteKey);
  memory.failures = filterEntriesBySite(memory.failures, siteKey);
  memory.transitions = Object.fromEntries(
    Object.entries(memory.transitions ?? {})
      .map(([fingerprint, entries]) => [fingerprint, (entries ?? []).filter((entry) => entry.siteKey === siteKey)])
      .filter(([, entries]) => entries.length > 0)
  );
  memory.lastStateModel = selectLastStateModelForSite(sourceMemory, siteKey);
  delete memory.lastStateModelBySite;
  memory.siteKey = siteKey;
  return memory;
}

export function buildPersistedStrategyMemory(session = {}, siteKey = activeSiteKey(session)) {
  const memory = buildSiteScopedStrategyMemory(session, siteKey);
  const sanitizedLocatorStats = {};
  for (const [key, entry] of Object.entries(memory.locatorStats ?? {})) {
    if (entry.siteKey !== siteKey) {
      continue;
    }
    const safeLocator = sanitizeLocator(entry.locator, { dropIfChanged: true });
    if (!safeLocator) {
      continue;
    }
    sanitizedLocatorStats[key] = {
      ...entry,
      locator: safeLocator,
      label: sanitizeNarrativeText(entry.label),
    };
  }
  memory.locatorStats = sanitizedLocatorStats;
  for (const state of Object.values(memory.states ?? {})) {
    if (state.lastSeenUrl) {
      state.lastSeenUrl = sanitizeStoredUrl(state.lastSeenUrl);
    }
    if (state.summaryLabel) {
      state.summaryLabel = sanitizeNarrativeText(state.summaryLabel);
    }
  }
  memory.failures = memory.failures.map((entry) => ({
    ...entry,
    locator: sanitizeLocator(entry.locator, { dropIfChanged: false }),
  }));
  for (const entries of Object.values(memory.transitions ?? {})) {
    for (const entry of entries) {
      entry.targetSummaryLabel = sanitizeNarrativeText(entry.targetSummaryLabel);
    }
  }
  memory.lastStateModel = sanitizeStateModel(memory.lastStateModel);
  return memory;
}

export { siteKeyFromUrl };
