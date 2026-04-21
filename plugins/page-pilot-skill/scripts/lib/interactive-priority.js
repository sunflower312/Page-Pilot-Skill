export const INTERACTIVE_PRIORITY_CONFIG = Object.freeze({
  patterns: Object.freeze({
    forwardAction: String.raw`\b(?:start|resume|next|continue|save|confirm|submit|send|search|finish|complete|done)\b`,
    secondaryAction: String.raw`\b(?:cancel|skip|close|dismiss|back|later)\b`,
    accountWorkflowLink:
      String.raw`\b(?:open new account|accounts overview|transfer funds|bill pay|find transactions|update contact info|request loan|account services)\b`,
    chromeHint:
      String.raw`\b(?:read more|learn more|documentation|docs|blog|events|privacy|terms|cookie|support|help|contact|careers|community|pricing|products|solutions|partners|language|theme|overview)\b`,
  }),
  scores: Object.freeze({
    visible: 40,
    enabled: 4,
    highValue: 18,
    testId: 42,
    withinDialog: 28,
    withinForm: 26,
    withinMain: 12,
    forwardWorkflowAction: 24,
    secondaryWorkflowAction: 4,
    forwardWorkflowLink: 8,
    accountWorkflowLink: 22,
    withinHeader: -16,
    withinFooter: -14,
    withinNav: -12,
    withinAside: -8,
    chromeLink: -10,
  }),
});

export function createInteractivePriorityRuntime({ config, focus } = {}) {
  const groupDefaultRole = {
    buttons: 'button',
    links: 'link',
    inputs: 'textbox',
    selects: 'combobox',
    textareas: 'textbox',
    checkboxes: 'checkbox',
    radios: 'radio',
    switches: 'switch',
    sliders: 'slider',
    tabs: 'tab',
    options: 'option',
    menuItems: 'menuitem',
    fileInputs: 'button',
    dateInputs: 'textbox',
  };
  const roleGroup = {
    button: 'buttons',
    link: 'links',
    textbox: 'inputs',
    searchbox: 'inputs',
    combobox: 'selects',
    checkbox: 'checkboxes',
    radio: 'radios',
    switch: 'switches',
    slider: 'sliders',
    tab: 'tabs',
    option: 'options',
    menuitem: 'menuItems',
  };
  const resolvedConfig = config ?? INTERACTIVE_PRIORITY_CONFIG;
  const focusKind = focus?.kind ?? 'generic';
  const focusTargetText = compactText(String(focus?.targetText ?? '')).toLowerCase();
  const patterns = {
    forwardAction: new RegExp(resolvedConfig.patterns?.forwardAction ?? '', 'i'),
    secondaryAction: new RegExp(resolvedConfig.patterns?.secondaryAction ?? '', 'i'),
    accountWorkflowLink: new RegExp(resolvedConfig.patterns?.accountWorkflowLink ?? '', 'i'),
    chromeHint: new RegExp(resolvedConfig.patterns?.chromeHint ?? '', 'i'),
  };
  const scores = resolvedConfig.scores ?? {};

  function compactText(value) {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function clipText(value, maxChars) {
    return compactText(value).slice(0, maxChars);
  }

  function normalizeAriaBoolean(value) {
    if (value === true) {
      return true;
    }
    return compactText(String(value ?? '')).toLowerCase() === 'true';
  }

  function inferInteractiveGroup(entry = {}) {
    if (entry.group) {
      return entry.group;
    }
    return roleGroup[entry.role] ?? '';
  }

  function inferInteractiveRole(entry = {}) {
    if (entry.role) {
      return entry.role;
    }
    return groupDefaultRole[entry.group] ?? 'control';
  }

  function normalizeInteractiveEntry(entry = {}) {
    const group = inferInteractiveGroup(entry);
    const role = inferInteractiveRole({ ...entry, group });
    const ariaDisabled = normalizeAriaBoolean(entry.ariaDisabled);

    return {
      ...entry,
      group,
      role,
      name: compactText(entry.name),
      text: compactText(entry.text),
      label: compactText(entry.label),
      testId: compactText(entry.testId),
      visible: entry.visible !== false,
      disabled: entry.disabled === true || ariaDisabled,
      ariaDisabled,
      highValue: entry.highValue === true,
      withinMain: entry.withinMain === true,
      withinForm: entry.withinForm === true,
      withinDialog: entry.withinDialog === true,
      withinHeader: entry.withinHeader === true,
      withinFooter: entry.withinFooter === true,
      withinNav: entry.withinNav === true,
      withinAside: entry.withinAside === true,
      isSubmitControl: entry.isSubmitControl === true,
    };
  }

  function getInteractiveLabel(entry = {}) {
    const normalized = normalizeInteractiveEntry(entry);
    return compactText(Array.from(new Set([normalized.name, normalized.text, normalized.label].filter(Boolean))).join(' '));
  }

  function hasTargetText(value = '') {
    if (!focusTargetText) {
      return false;
    }
    return compactText(String(value)).toLowerCase().includes(focusTargetText);
  }

  function getFocusTargetBoost(entry = {}) {
    if (!focusTargetText) {
      return 0;
    }

    let score = 0;
    if (hasTargetText(entry.accessibleName) || hasTargetText(entry.name) || hasTargetText(entry.text) || hasTargetText(entry.label)) {
      score += 16;
    }
    if (hasTargetText(entry.visibleText) || hasTargetText(entry.description)) {
      score += 8;
    }
    if (hasTargetText(entry.localContext?.heading?.text)) {
      score += 6;
    }
    if (hasTargetText(entry.localContext?.table?.name) || hasTargetText(entry.localContext?.list?.name)) {
      score += 5;
    }

    return Math.min(score, 20);
  }

  function getWorkflowActionKind(entry = {}) {
    const label = getInteractiveLabel(entry);
    if (patterns.forwardAction.test(label)) {
      return 'forward';
    }
    if (patterns.secondaryAction.test(label)) {
      return 'secondary';
    }
    return 'none';
  }

  function hasWorkflowActionText(entry = {}) {
    return getWorkflowActionKind(entry) !== 'none';
  }

  function hasForwardWorkflowActionText(entry = {}) {
    const normalized = normalizeInteractiveEntry(entry);
    return getWorkflowActionKind(normalized) === 'forward' || patterns.accountWorkflowLink.test(getInteractiveLabel(normalized));
  }

  function hasSecondaryWorkflowActionText(entry = {}) {
    return getWorkflowActionKind(entry) === 'secondary';
  }

  function looksLikeChromeLink(entry = {}) {
    const normalized = normalizeInteractiveEntry(entry);
    return normalized.group === 'links' && patterns.chromeHint.test(getInteractiveLabel(normalized));
  }

  function getInteractiveHighValue(entry = {}) {
    const normalized = normalizeInteractiveEntry(entry);

    if (normalized.highValue === true) {
      return true;
    }

    if (['inputs', 'selects', 'textareas', 'checkboxes'].includes(normalized.group)) {
      return true;
    }

    if (['buttons', 'links'].includes(normalized.group)) {
      return (
        Boolean(normalized.testId) ||
        normalized.isSubmitControl === true ||
        normalized.withinForm === true ||
        normalized.withinDialog === true ||
        hasWorkflowActionText(normalized) ||
        patterns.accountWorkflowLink.test(getInteractiveLabel(normalized))
      );
    }

    return Boolean(normalized.highValue);
  }

  function finalizeInteractiveEntry(entry = {}) {
    const normalized = normalizeInteractiveEntry(entry);
    return {
      ...normalized,
      highValue: getInteractiveHighValue(normalized),
    };
  }

  function calculateInteractivePriorityScore(entry = {}) {
    let score = 0;

    if (entry.visible !== false) {
      score += scores.visible ?? 0;
    }
    if (entry.disabled !== true) {
      score += scores.enabled ?? 0;
    }
    if (getInteractiveHighValue(entry)) {
      score += scores.highValue ?? 0;
    }
    if (entry.testId) {
      score += scores.testId ?? 0;
    }
    if (entry.withinDialog) {
      score += scores.withinDialog ?? 0;
    }
    if (entry.withinForm) {
      score += scores.withinForm ?? 0;
    }
    if (entry.withinMain) {
      score += scores.withinMain ?? 0;
    }
    if (hasForwardWorkflowActionText(entry)) {
      score += scores.forwardWorkflowAction ?? 0;
    }
    if (hasSecondaryWorkflowActionText(entry)) {
      score += scores.secondaryWorkflowAction ?? 0;
    }
    if (entry.group === 'links' && hasForwardWorkflowActionText(entry)) {
      score += scores.forwardWorkflowLink ?? 0;
    }
    if (entry.group === 'links' && patterns.accountWorkflowLink.test(getInteractiveLabel(entry))) {
      score += scores.accountWorkflowLink ?? 0;
    }
    if (entry.withinHeader) {
      score += scores.withinHeader ?? 0;
    }
    if (entry.withinFooter) {
      score += scores.withinFooter ?? 0;
    }
    if (entry.withinNav) {
      score += scores.withinNav ?? 0;
    }
    if (entry.withinAside) {
      score += scores.withinAside ?? 0;
    }
    if (looksLikeChromeLink(entry)) {
      score += scores.chromeLink ?? 0;
    }

    if (focusKind === 'form_fill') {
      if (['inputs', 'selects', 'textareas', 'checkboxes', 'radios', 'fileInputs', 'dateInputs'].includes(entry.group)) {
        score += 18;
      }
      if (entry.group === 'buttons' && (entry.isSubmitControl === true || hasForwardWorkflowActionText(entry))) {
        score += 14;
      }
    }

    if (focusKind === 'dialog') {
      if (entry.withinDialog) {
        score += 18;
      }
    }

    if (focusKind === 'search_results' || focusKind === 'table_actions') {
      if (entry.localContext?.table || entry.localContext?.list) {
        score += 14;
      }
      if (entry.group === 'buttons' || entry.group === 'links') {
        score += 6;
      }
    }

    if (focusKind === 'navigation' && entry.group === 'links') {
      score += 10;
    }

    score += getFocusTargetBoost(entry);

    return score;
  }

  function getInteractivePriorityScore(entry = {}) {
    return calculateInteractivePriorityScore(finalizeInteractiveEntry(entry));
  }

  function compareInteractivePriority(left = {}, right = {}) {
    const normalizedLeft = finalizeInteractiveEntry(left);
    const normalizedRight = finalizeInteractiveEntry(right);
    const priorityDelta = calculateInteractivePriorityScore(normalizedRight) - calculateInteractivePriorityScore(normalizedLeft);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftHighValue = normalizedLeft.highValue === true;
    const rightHighValue = normalizedRight.highValue === true;
    if (leftHighValue !== rightHighValue) {
      return Number(rightHighValue) - Number(leftHighValue);
    }

    if (Boolean(normalizedLeft.testId) !== Boolean(normalizedRight.testId)) {
      return Number(Boolean(normalizedRight.testId)) - Number(Boolean(normalizedLeft.testId));
    }
    if ((normalizedLeft.visible !== false) !== (normalizedRight.visible !== false)) {
      return Number(normalizedRight.visible !== false) - Number(normalizedLeft.visible !== false);
    }
    return (normalizedLeft.domIndex ?? Number.MAX_SAFE_INTEGER) - (normalizedRight.domIndex ?? Number.MAX_SAFE_INTEGER);
  }

  function shouldKeepInteractive(entry = {}) {
    const normalized = finalizeInteractiveEntry(entry);
    return normalized.visible !== false || Boolean(normalized.testId);
  }

  return {
    compactText,
    clipText,
    normalizeInteractiveEntry,
    getInteractiveLabel,
    getWorkflowActionKind,
    hasWorkflowActionText,
    hasForwardWorkflowActionText,
    hasSecondaryWorkflowActionText,
    looksLikeChromeLink,
    getInteractiveHighValue,
    finalizeInteractiveEntry,
    getInteractivePriorityScore,
    compareInteractivePriority,
    shouldKeepInteractive,
  };
}

export const BROWSER_INTERACTIVE_RUNTIME_SOURCE = createInteractivePriorityRuntime.toString();

export function instantiateInteractivePriorityRuntime(payload = {}) {
  const factory = Function(`return (${payload.interactiveRuntimeSource})`)();
  return factory({ config: payload.interactivePriorityConfig, focus: payload.focus });
}

export const BROWSER_INTERACTIVE_RUNTIME_INSTANTIATOR_SOURCE = instantiateInteractivePriorityRuntime.toString();

export function buildBrowserInteractiveRuntimePayload(overrides = {}) {
  return {
    interactivePriorityConfig: INTERACTIVE_PRIORITY_CONFIG,
    interactiveRuntimeSource: BROWSER_INTERACTIVE_RUNTIME_SOURCE,
    interactiveRuntimeInstantiatorSource: BROWSER_INTERACTIVE_RUNTIME_INSTANTIATOR_SOURCE,
    ...overrides,
  };
}

const DEFAULT_RUNTIME = createInteractivePriorityRuntime({ config: INTERACTIVE_PRIORITY_CONFIG });

export const compactText = DEFAULT_RUNTIME.compactText;
export const clipText = DEFAULT_RUNTIME.clipText;
export const normalizeInteractiveEntry = DEFAULT_RUNTIME.normalizeInteractiveEntry;
export const getInteractiveLabel = DEFAULT_RUNTIME.getInteractiveLabel;
export const getWorkflowActionKind = DEFAULT_RUNTIME.getWorkflowActionKind;
export const hasWorkflowActionText = DEFAULT_RUNTIME.hasWorkflowActionText;
export const hasForwardWorkflowActionText = DEFAULT_RUNTIME.hasForwardWorkflowActionText;
export const hasSecondaryWorkflowActionText = DEFAULT_RUNTIME.hasSecondaryWorkflowActionText;
export const looksLikeChromeLink = DEFAULT_RUNTIME.looksLikeChromeLink;
export const getInteractiveHighValue = DEFAULT_RUNTIME.getInteractiveHighValue;
export const finalizeInteractiveEntry = DEFAULT_RUNTIME.finalizeInteractiveEntry;
export const getInteractivePriorityScore = DEFAULT_RUNTIME.getInteractivePriorityScore;
export const compareInteractivePriority = DEFAULT_RUNTIME.compareInteractivePriority;
export const shouldKeepInteractive = DEFAULT_RUNTIME.shouldKeepInteractive;
