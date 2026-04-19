function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lowerText(value) {
  return compactText(value).toLowerCase();
}

function sanitizeNarrativeText(value = '') {
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/([?&](?:token|otp|code|password|secret)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b((?:token|otp|code|password|secret)=)[^\s&]+/gi, '$1[redacted]');
}

function sanitizeLocator(locator = null) {
  if (!locator) {
    return null;
  }
  if (locator.strategy === 'role') {
    return {
      strategy: 'role',
      value: {
        role: sanitizeNarrativeText(locator.value?.role ?? ''),
        name: sanitizeNarrativeText(locator.value?.name ?? ''),
      },
    };
  }
  return {
    strategy: locator.strategy,
    value: sanitizeNarrativeText(locator.value ?? ''),
  };
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin === 'null') {
      return `${parsed.protocol}//opaque`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url ?? '');
  }
}

function buildSignals(scan = {}) {
  const actionableCount = [
    ...(scan.interactives?.buttons ?? []),
    ...(scan.interactives?.links ?? []),
    ...(scan.interactives?.inputs ?? []),
    ...(scan.interactives?.selects ?? []),
    ...(scan.interactives?.textareas ?? []),
    ...(scan.interactives?.checkboxes ?? []),
  ].filter((entry) => entry.visible !== false && entry.disabled !== true).length;

  return {
    hasPrimaryAction: Boolean(scan.hints?.primaryAction?.locator),
    hasDialog: Boolean(scan.hints?.activeDialog?.name || scan.hints?.activeDialog?.text),
    hasForms: (scan.hints?.formFields?.length ?? 0) > 0,
    hasLists: (scan.summary?.lists?.length ?? 0) > 0,
    hasFrames: Boolean(scan.hints?.context?.hasFrames),
    hasShadowHosts: Boolean(scan.hints?.context?.hasShadowHosts),
    interactiveCount: scan.summary?.retainedInteractiveCount ?? 0,
    actionableCount,
  };
}

function buildCorpus(scan = {}) {
  return lowerText([
    scan.title,
    scan.summary?.mainText,
    ...(scan.summary?.headings ?? []).map((entry) => entry.text),
    ...(scan.hints?.formFields ?? []).map((entry) => entry.label),
    scan.hints?.primaryAction?.label,
    scan.hints?.activeDialog?.name,
    scan.hints?.activeDialog?.text,
  ].join(' '));
}

function inferPageType(corpus, signals) {
  if (signals.hasDialog) {
    return 'dialog';
  }
  if (/(sign in|login|log in|password|verification code|otp|two-factor|2fa)/.test(corpus)) {
    return 'auth';
  }
  if (signals.hasForms && signals.hasPrimaryAction) {
    return 'form';
  }
  if (signals.hasLists && signals.interactiveCount >= 2) {
    return 'listing';
  }
  if (/(course|lesson|module|chapter|continue learning|resume)/.test(corpus)) {
    return 'learning';
  }
  if (signals.hasPrimaryAction) {
    return 'detail';
  }
  if ((signals.interactiveCount ?? 0) <= 3 && compactText(corpus).length > 0) {
    return 'content';
  }
  return 'unknown';
}

function inferReadiness(pageType, signals) {
  if (signals.hasDialog) {
    return 'blocked_by_dialog';
  }
  if (pageType === 'auth' || pageType === 'form') {
    return 'awaiting_input';
  }
  if (signals.hasPrimaryAction || signals.actionableCount > 0) {
    return 'ready_for_action';
  }
  if (pageType === 'content') {
    return 'content_ready';
  }
  return 'loading_or_sparse';
}

function buildFingerprint(scan, pageType) {
  const parts = [
    normalizeUrl(scan.url),
    pageType,
    lowerText(scan.hints?.activeDialog?.name),
    lowerText(scan.hints?.primaryAction?.label),
    ...(scan.hints?.formFields ?? []).slice(0, 2).map((entry) => lowerText(entry.label)),
  ].filter(Boolean);
  return parts.join('|') || 'unknown-state';
}

function buildSummaryLabel(scan, pageType) {
  return compactText(
    scan.hints?.activeDialog?.name || scan.hints?.activeDialog?.text || scan.hints?.primaryAction?.label || scan.title || pageType
  );
}

function buildPrimaryAction(scan = {}) {
  if (!scan.hints?.primaryAction?.locator) {
    return null;
  }
  return {
    label: scan.hints.primaryAction.label || '',
    locator: scan.hints.primaryAction.locator,
  };
}

export function buildPageStateModel(scan = {}) {
  const signals = buildSignals(scan);
  const corpus = buildCorpus(scan);
  const pageType = inferPageType(corpus, signals);
  const readiness = inferReadiness(pageType, signals);

  return {
    fingerprint: buildFingerprint(scan, pageType),
    pageType,
    readiness,
    url: scan.url ?? null,
    normalizedUrl: normalizeUrl(scan.url),
    title: scan.title ?? '',
    summaryLabel: buildSummaryLabel(scan, pageType),
    primaryAction: buildPrimaryAction(scan),
    activeDialog: scan.hints?.activeDialog
      ? {
          name: scan.hints.activeDialog.name || '',
          text: compactText(scan.hints.activeDialog.text || ''),
        }
      : null,
    signals,
  };
}

function detectGoalFlags(goal = '') {
  const text = lowerText(goal);
  return {
    authenticate: /(登录|sign in|login|认证|authenticate)/.test(text),
    navigate: /(进入|打开|navigate|go to|course|module|lesson|模块)/.test(text),
    complete: /(学习|learn|study|submit|填写|完成|watch|read|resume|continue)/.test(text),
    returnOrContinue: /(返回|回去|back|return|catalog|目录|列表|继续后续|继续下一个|continue after)/.test(text),
  };
}

function pushPhase(phases, id, label, reason, status = 'pending') {
  if (!phases.some((phase) => phase.id === id)) {
    phases.push({ id, label, reason, status });
  }
}

export function buildTaskPlan(goal = '', stateModel = {}) {
  const flags = detectGoalFlags(goal);
  const phases = [];

  if (flags.authenticate || stateModel.pageType === 'auth') {
    pushPhase(phases, 'authenticate', '完成认证', '当前页面或目标显式涉及认证', stateModel.pageType === 'auth' ? 'current' : 'pending');
  }
  if (flags.navigate || stateModel.pageType === 'listing') {
    pushPhase(phases, 'navigate_to_target', '进入目标模块', '目标或页面结构显示需要继续导航', stateModel.pageType === 'listing' ? 'current' : 'pending');
  }
  if (flags.complete || ['form', 'learning', 'detail'].includes(stateModel.pageType)) {
    pushPhase(
      phases,
      'complete_primary_work',
      '完成当前主任务',
      '当前页面存在可执行主动作或目标明确要求完成主流程',
      ['form', 'learning', 'detail'].includes(stateModel.pageType) ? 'current' : 'pending'
    );
  }
  if (flags.returnOrContinue) {
    pushPhase(phases, 'return_or_continue', '返回或继续后续阶段', '目标中包含继续或返回路径');
  }
  pushPhase(phases, 'verify_outcome', '验证结果', '任何自动化流程都需要显式确认结果');

  return phases;
}

function makeSuggestion(action, label, rationale, locator = null) {
  return { action, label, rationale, locator };
}

function learnedActionLabel(transition = {}) {
  const action = transition.actions?.[0] ?? {};
  if (action.locator?.strategy === 'role') {
    return action.locator.value?.name ?? action.locator.value?.role ?? '已学习路径';
  }
  return String(action.locator?.value ?? transition.targetSummaryLabel ?? '已学习路径');
}

function listingEntryLocator(entry = {}) {
  return entry.preferredLocator ?? entry.locator ?? null;
}

function firstVisibleEntry(entries = []) {
  return entries.find((entry) => listingEntryLocator(entry) && entry.visible !== false) ?? null;
}

export function suggestNextActions(scan = {}, stateModel = {}, _taskPlan = [], learnedExperience = {}) {
  const suggestions = [];

  if (stateModel.readiness === 'blocked_by_dialog' && stateModel.primaryAction) {
    suggestions.push(makeSuggestion('dismiss_or_confirm_dialog', stateModel.primaryAction.label, '页面被对话框阻塞，优先关闭或确认弹窗', stateModel.primaryAction.locator));
  }

  if (stateModel.readiness === 'awaiting_input') {
    for (const field of (scan.hints?.formFields ?? []).slice(0, 2)) {
      suggestions.push(makeSuggestion('fill_field', field.label, '当前页面是表单或登录态，优先完成关键输入字段', field.locator));
    }
    if (stateModel.primaryAction) {
      suggestions.push(makeSuggestion('submit_form', stateModel.primaryAction.label, '输入完成后触发主动作，推进流程', stateModel.primaryAction.locator));
    }
  }

  if (stateModel.pageType === 'listing' && stateModel.primaryAction) {
    suggestions.push(makeSuggestion('open_primary_target', stateModel.primaryAction.label, '当前更像列表或入口页，优先进入主要模块', stateModel.primaryAction.locator));
  }

  if (stateModel.pageType === 'listing' && !stateModel.primaryAction) {
    const listingEntry = firstVisibleEntry([...(scan.interactives?.links ?? []), ...(scan.interactives?.buttons ?? [])]);
    if (listingEntry) {
      suggestions.push(
        makeSuggestion(
          'open_primary_target',
          listingEntry.name || listingEntry.text || '打开列表入口',
          '当前更像列表页，优先进入第一个高可见入口继续探索',
          listingEntryLocator(listingEntry)
        )
      );
    }
  }

  if (stateModel.readiness === 'ready_for_action' && stateModel.primaryAction) {
    suggestions.push(makeSuggestion('trigger_primary_action', stateModel.primaryAction.label, '页面已经可交互，可以优先尝试主动作', stateModel.primaryAction.locator));
  }

  if ((learnedExperience.preferredTransitions ?? []).length > 0) {
    const learned = learnedExperience.preferredTransitions[0];
    const locator = learned.actions?.[0]?.locator ?? null;
    suggestions.push(
      makeSuggestion(
        'reuse_learned_path',
        learnedActionLabel(learned),
        '当前状态已经存在学到的成功路径，优先复用它比从零猜测更稳定',
        locator
      )
    );
  }

  if ((learnedExperience.stableLocators ?? []).length > 0) {
    const learned = learnedExperience.stableLocators[0];
    suggestions.push(makeSuggestion('reuse_learned_locator', learned.label, '该站点已经学习到稳定定位方式，可作为优先候选', learned.locator));
  }

  return suggestions.slice(0, 5);
}

function buildFailureSummary(lastFailure = null) {
  if (!lastFailure) {
    return null;
  }
  return {
    message: sanitizeNarrativeText(lastFailure.error?.message ?? lastFailure.message ?? 'Unknown action failure'),
    actionType: lastFailure.action?.type ?? lastFailure.actionType ?? null,
    locator: sanitizeLocator(lastFailure.action?.locator ?? lastFailure.locator ?? null),
  };
}

export function buildRecoveryPlan({ scan = {}, stateModel = {}, lastFailure = null, learnedExperience = {} } = {}) {
  const suggestions = [];

  if (stateModel.readiness === 'blocked_by_dialog' && stateModel.primaryAction) {
    suggestions.push(makeSuggestion('dismiss_dialog_then_retry', stateModel.primaryAction.label, '弹窗会拦截后续定位和点击，先解除阻塞再重试', stateModel.primaryAction.locator));
  }

  if ((lastFailure?.error?.message ?? '').includes('resolve') && (learnedExperience.stableLocators ?? []).length > 0) {
    const learned = learnedExperience.stableLocators[0];
    suggestions.push(makeSuggestion('retry_with_learned_locator', learned.label, '已学习到更稳定的定位方式，优先替换失败 locator 后重试', learned.locator));
  }

  if ((learnedExperience.preferredTransitions ?? []).length > 0) {
    const learned = learnedExperience.preferredTransitions[0];
    suggestions.push(
      makeSuggestion(
        'resume_learned_path',
        learnedActionLabel(learned),
        '当前页面已有成功过的站点路径，优先沿着已验证路径恢复比盲试更可靠',
        learned.actions?.[0]?.locator ?? null
      )
    );
  }

  if ((lastFailure?.action?.type ?? '') === 'assert_text') {
    suggestions.push(makeSuggestion('rescan_and_reassert', '重新扫描当前页面', '断言失败常见于状态未完全刷新，先重扫页面状态再决定是否补等待', null));
  }

  if (stateModel.signals?.hasFrames) {
    suggestions.push(makeSuggestion('inspect_frames', '检查 iframe', '页面包含 frame，失败步骤可能实际发生在子文档上下文', null));
  }

  if (stateModel.signals?.hasShadowHosts || scan.hints?.context?.hasShadowHosts) {
    suggestions.push(makeSuggestion('prefer_semantic_locators', '优先 label/testId', '页面存在 Shadow DOM，语义化 locator 通常比脆弱 CSS 更稳定', null));
  }

  return {
    status: suggestions.length > 0 ? 'actionable' : 'monitor',
    lastFailure: buildFailureSummary(lastFailure),
    suggestions: suggestions.slice(0, 5),
  };
}
