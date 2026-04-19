import {
  BROWSER_INTERACTIVE_RUNTIME_INSTANTIATOR_SOURCE,
  BROWSER_INTERACTIVE_RUNTIME_SOURCE,
  INTERACTIVE_PRIORITY_CONFIG,
  buildBrowserInteractiveRuntimePayload,
  clipText,
  compactText,
  compareInteractivePriority,
  createInteractivePriorityRuntime,
  finalizeInteractiveEntry,
  getInteractiveHighValue,
  getInteractiveLabel,
  getInteractivePriorityScore,
  getWorkflowActionKind,
  hasForwardWorkflowActionText,
  hasSecondaryWorkflowActionText,
  hasWorkflowActionText,
  looksLikeChromeLink,
} from './interactive-priority.js';

export {
  BROWSER_INTERACTIVE_RUNTIME_INSTANTIATOR_SOURCE,
  BROWSER_INTERACTIVE_RUNTIME_SOURCE,
  INTERACTIVE_PRIORITY_CONFIG,
  buildBrowserInteractiveRuntimePayload,
  clipText,
  compactText,
  compareInteractivePriority,
  createInteractivePriorityRuntime,
  finalizeInteractiveEntry,
  getInteractiveHighValue,
  getInteractiveLabel,
  getInteractivePriorityScore,
  getWorkflowActionKind,
  hasForwardWorkflowActionText,
  hasSecondaryWorkflowActionText,
  hasWorkflowActionText,
  looksLikeChromeLink,
};

function sortInteractiveEntries(entries = []) {
  return [...entries].sort(compareInteractivePriority);
}

export function selectActiveDialog(dialogs = []) {
  return dialogs.find((dialog) => dialog.open !== false && dialog.visible !== false) ?? dialogs.find((dialog) => dialog.open !== false) ?? null;
}

function pickPrimaryAction(entries = []) {
  return (
    entries.find((entry) => hasForwardWorkflowActionText(entry)) ??
    entries.find((entry) => getInteractiveHighValue(entry) || hasWorkflowActionText(entry)) ??
    entries[0] ??
    null
  );
}

function isVisibleEnabledActionableEntry(entry = {}) {
  return ['buttons', 'links'].includes(entry.group) && entry.visible !== false && entry.disabled !== true;
}

export function selectPrimaryAction(interactives = [], activeDialog = null) {
  const ranked = sortInteractiveEntries(interactives).map((entry) => finalizeInteractiveEntry(entry));
  const visibleActions = ranked.filter((entry) => isVisibleEnabledActionableEntry(entry));

  return (
    pickPrimaryAction(activeDialog ? visibleActions.filter((entry) => entry.withinDialog) : []) ??
    pickPrimaryAction(visibleActions.filter((entry) => entry.withinForm && !entry.withinDialog)) ??
    pickPrimaryAction(visibleActions.filter((entry) => !entry.withinHeader && !entry.withinFooter && !entry.withinNav)) ??
    visibleActions[0] ??
    null
  );
}

function normalizePrimaryAction(entry = null) {
  if (!entry) {
    return null;
  }
  const normalized = finalizeInteractiveEntry(entry);

  return {
    label: getInteractiveLabel(normalized),
    role: normalized.role || (normalized.group === 'links' ? 'link' : 'button'),
    disabled: normalized.disabled === true,
    withinDialog: normalized.withinDialog === true,
    withinForm: normalized.withinForm === true,
    withinMain: normalized.withinMain === true,
    testId: normalized.testId || '',
  };
}

function normalizeDialog(dialog = null, primaryAction = null, { allowFallbackPrimaryAction = true } = {}) {
  if (!dialog) {
    return null;
  }

  const dialogPrimaryAction =
    (primaryAction?.withinDialog ? normalizePrimaryAction(primaryAction) : null) ??
    (allowFallbackPrimaryAction ? normalizePrimaryAction(dialog.primaryAction) : null);

  return {
    label: compactText(dialog.name || dialog.label || ''),
    summary: clipText(dialog.summary || dialog.text || '', 180),
    open: dialog.open !== false,
    primaryAction: dialogPrimaryAction,
  };
}

function normalizeRegionText(value, maxChars) {
  return clipText(value || '', maxChars);
}

function normalizeInteractionEntry(entry = {}) {
  const normalizedEntry = finalizeInteractiveEntry(entry);
  const normalized = {
    label: getInteractiveLabel(normalizedEntry),
    role:
      normalizedEntry.role ||
      (normalizedEntry.group === 'links' ? 'link' : normalizedEntry.group === 'buttons' ? 'button' : normalizedEntry.role || 'control'),
    disabled: normalizedEntry.disabled === true,
    withinDialog: normalizedEntry.withinDialog === true,
    withinMain: normalizedEntry.withinMain === true,
    withinForm: normalizedEntry.withinForm === true,
  };

  if (typeof normalizedEntry.checked === 'boolean') {
    normalized.checked = normalizedEntry.checked;
  }

  return normalized;
}

function toNumericState(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildInteractionStateSummary(rawInteraction = {}) {
  return {
    busyCount: toNumericState(rawInteraction.busyCount),
    disabledCount: toNumericState(rawInteraction.disabledCount),
    hiddenInteractiveCount: toNumericState(rawInteraction.hiddenInteractiveCount),
    checkedCount: toNumericState(rawInteraction.checkedCount),
  };
}

function normalizeInteractionState(rawInteraction = {}, fallbackEntries = []) {
  const candidates = rawInteraction.keyInteractives?.length ? rawInteraction.keyInteractives : fallbackEntries;
  const ranked = sortInteractiveEntries(candidates)
    .filter((entry) => entry.visible !== false)
    .slice(0, 6)
    .map((entry) => normalizeInteractionEntry(entry));

  return {
    ...buildInteractionStateSummary(rawInteraction),
    keyInteractives: ranked,
  };
}

const SEMANTIC_ROLE_GROUP = Object.freeze({
  button: 'buttons',
  link: 'links',
  textbox: 'inputs',
  searchbox: 'inputs',
  combobox: 'selects',
  checkbox: 'checkboxes',
});

function inferSemanticGroup(entry = {}) {
  if (entry.group) {
    return entry.group;
  }
  return SEMANTIC_ROLE_GROUP[entry.role] ?? '';
}

function normalizeSemanticInteractiveCandidate(entry = null, overrides = {}) {
  if (!entry) {
    return null;
  }

  return finalizeInteractiveEntry({
    ...entry,
    ...overrides,
    group: overrides.group ?? inferSemanticGroup(entry),
    name: entry.name ?? entry.label ?? entry.text ?? '',
    text: entry.text ?? entry.label ?? entry.name ?? '',
    label: entry.label ?? entry.name ?? entry.text ?? '',
  });
}

function dedupeSemanticInteractiveCandidates(entries = []) {
  const seen = new Set();
  const unique = [];

  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    const normalized = finalizeInteractiveEntry(entry);
    const key = JSON.stringify([
      normalized.group,
      normalized.role,
      getInteractiveLabel(normalized),
      normalized.testId || '',
      normalized.disabled === true,
      normalized.withinDialog === true,
      normalized.withinForm === true,
      normalized.withinMain === true,
    ]);

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function normalizeSemanticDialogCandidate(dialog = null) {
  if (!dialog) {
    return null;
  }

  return {
    ...dialog,
    name: compactText(dialog.name || dialog.label || ''),
    label: compactText(dialog.label || dialog.name || ''),
    summary: clipText(dialog.summary || dialog.text || '', 180),
    text: clipText(dialog.text || dialog.summary || '', 220),
    open: dialog.open !== false,
    visible: dialog.visible !== false,
  };
}

function buildSemanticShapeInteractives(rawSemantic = {}) {
  const interactionCandidates = (rawSemantic.interaction?.keyInteractives ?? []).map((entry, index) =>
    normalizeSemanticInteractiveCandidate(entry, { domIndex: entry.domIndex ?? index })
  );
  const hasActionableInteractionCandidate = interactionCandidates.some((entry) => isVisibleEnabledActionableEntry(entry));
  const fallbackCandidates = [
    normalizeSemanticInteractiveCandidate(rawSemantic.activeDialog?.primaryAction, {
      withinDialog: true,
      domIndex: interactionCandidates.length,
    }),
    hasActionableInteractionCandidate
      ? null
      : normalizeSemanticInteractiveCandidate(rawSemantic.primaryAction, {
          domIndex: interactionCandidates.length + 1,
        }),
  ];

  return dedupeSemanticInteractiveCandidates([...interactionCandidates, ...fallbackCandidates]);
}

export function buildSemanticSnapshot(rawSemantic = {}) {
  if (
    Object.prototype.hasOwnProperty.call(rawSemantic, 'activeDialog') ||
    Object.prototype.hasOwnProperty.call(rawSemantic, 'primaryAction') ||
    ((!Object.prototype.hasOwnProperty.call(rawSemantic, 'dialogs') ||
      !Object.prototype.hasOwnProperty.call(rawSemantic, 'interactives')) &&
      (Object.prototype.hasOwnProperty.call(rawSemantic, 'regions') ||
        Object.prototype.hasOwnProperty.call(rawSemantic, 'interaction')))
  ) {
    const semanticInteractives = buildSemanticShapeInteractives(rawSemantic);
    const activeDialog = selectActiveDialog([normalizeSemanticDialogCandidate(rawSemantic.activeDialog)].filter(Boolean));
    const activeDialogPrimaryAction = activeDialog
      ? selectPrimaryAction(
          semanticInteractives.filter((entry) => entry.withinDialog === true),
          activeDialog
        )
      : null;
    const primaryAction = selectPrimaryAction(semanticInteractives, activeDialog);

    return {
      activeDialog: normalizeDialog(activeDialog, activeDialogPrimaryAction, {
        allowFallbackPrimaryAction: semanticInteractives.length === 0,
      }),
      primaryAction: normalizePrimaryAction(primaryAction),
      regions: {
        dialog: normalizeRegionText(rawSemantic.regions?.dialog || '', 220),
        main: normalizeRegionText(rawSemantic.regions?.main || '', 260),
        feedback: normalizeRegionText(rawSemantic.regions?.feedback || '', 220),
      },
      interaction: normalizeInteractionState(rawSemantic.interaction, semanticInteractives),
    };
  }

  const dialogs = rawSemantic.dialogs ?? [];
  const interactives = rawSemantic.interactives ?? [];
  const activeDialog = selectActiveDialog(dialogs);
  const primaryAction = selectPrimaryAction(interactives, activeDialog);

  return {
    activeDialog: normalizeDialog(activeDialog, primaryAction),
    primaryAction: normalizePrimaryAction(primaryAction),
    regions: {
      dialog: normalizeRegionText(rawSemantic.regions?.dialog || activeDialog?.summary || activeDialog?.text || '', 220),
      main: normalizeRegionText(rawSemantic.regions?.main || '', 260),
      feedback: normalizeRegionText(rawSemantic.regions?.feedback || '', 220),
    },
    interaction: normalizeInteractionState(rawSemantic.interaction, interactives),
  };
}
