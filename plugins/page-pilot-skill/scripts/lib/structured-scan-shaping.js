import { buildLocatorCandidates } from './locator-candidates.js';
import {
  clipText,
  compactText,
  compareInteractivePriority,
  shouldKeepInteractive,
} from './interactive-priority.js';
import { rankLocatorCandidates, unwrapRankedLocator } from './locator-ranking.js';
import { selectActiveDialog, selectPrimaryAction } from './semantic-model.js';

const DETAIL_SETTINGS = {
  brief: {
    maxInteractives: 6,
    maxFormFields: 2,
    maxDialogs: 1,
    maxFrames: 1,
    maxShadowHosts: 1,
    maxHeadings: 3,
    maxLists: 2,
    mainTextChars: 120,
  },
  standard: {
    maxInteractives: 12,
    maxFormFields: 4,
    maxDialogs: 2,
    maxFrames: 2,
    maxShadowHosts: 1,
    maxHeadings: 6,
    maxLists: 3,
    mainTextChars: 240,
  },
  full: {
    maxInteractives: 30,
    maxFormFields: 8,
    maxDialogs: 4,
    maxFrames: 4,
    maxShadowHosts: 4,
    maxHeadings: 12,
    maxLists: 8,
    mainTextChars: 4000,
  },
};

export const BROWSER_COLLECTION_SETTINGS = {
  brief: {
    maxButtons: 6,
    maxLinks: 4,
    maxInputs: 4,
    maxSelects: 2,
    maxTextareas: 1,
    maxCheckboxes: 2,
    maxDialogs: 1,
    maxFrames: 1,
    maxShadowHosts: 1,
    maxHeadings: 3,
    maxLists: 2,
    maxForms: 1,
    maxMains: 1,
    includeFrameText: false,
    includeShadowInteractives: false,
    discoverNestedShadowHosts: false,
  },
  standard: {
    maxButtons: 12,
    maxLinks: 6,
    maxInputs: 6,
    maxSelects: 3,
    maxTextareas: 2,
    maxCheckboxes: 3,
    maxDialogs: 2,
    maxFrames: 2,
    maxShadowHosts: 1,
    maxHeadings: 6,
    maxLists: 3,
    maxForms: 2,
    maxMains: 1,
    includeFrameText: false,
    includeShadowInteractives: true,
    discoverNestedShadowHosts: false,
  },
  full: {
    maxButtons: 30,
    maxLinks: 16,
    maxInputs: 20,
    maxSelects: 8,
    maxTextareas: 8,
    maxCheckboxes: 8,
    maxDialogs: 4,
    maxFrames: 4,
    maxShadowHosts: 4,
    maxHeadings: 12,
    maxLists: 8,
    maxForms: 4,
    maxMains: 2,
    includeFrameText: true,
    includeShadowInteractives: true,
    discoverNestedShadowHosts: true,
  },
};

function flattenInteractives(interactives = {}) {
  const result = [];

  for (const [group, entries] of Object.entries(interactives)) {
    for (const entry of entries ?? []) {
      result.push({ ...entry, group });
    }
  }

  return result;
}

function regroupInteractives(entries = []) {
  const groups = {
    buttons: [],
    links: [],
    inputs: [],
    selects: [],
    textareas: [],
    checkboxes: [],
  };

  for (const entry of entries) {
    groups[entry.group] ??= [];
    groups[entry.group].push(entry);
  }

  return groups;
}

function normalizeNullableBoolean(value) {
  if (value === true || value === false) {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return null;
}

function normalizeGeometry(geometry = null) {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }

  const x = Number(geometry.x);
  const y = Number(geometry.y);
  const width = Number(geometry.width);
  const height = Number(geometry.height);

  if (![x, y, width, height].every(Number.isFinite)) {
    return null;
  }

  const viewportVisibleRatio = Number(geometry.viewportVisibleRatio);

  return {
    x,
    y,
    width,
    height,
    viewportVisibleRatio: Number.isFinite(viewportVisibleRatio) ? viewportVisibleRatio : null,
  };
}

function inferEntryState(entry = {}) {
  return {
    disabled: entry.disabled === true,
    required: entry.required === true,
    readonly: entry.readonly === true,
    checked: typeof entry.checked === 'boolean' ? entry.checked : null,
    selected: typeof entry.selected === 'boolean' ? entry.selected : null,
    expanded: normalizeNullableBoolean(entry.expanded),
    pressed: normalizeNullableBoolean(entry.pressed),
    busy: normalizeNullableBoolean(entry.busy),
    value: typeof entry.value === 'string' ? entry.value : '',
  };
}

function inferEntryActionability(entry = {}) {
  const visible = entry.visible !== false;
  const enabled = entry.disabled !== true;
  const actionable = visible && enabled;
  const editable = actionable && ['inputs', 'textareas', 'selects'].includes(entry.group);
  const clickable = actionable && ['buttons', 'links', 'checkboxes'].includes(entry.group);
  const focusable = visible && entry.focusable !== false;

  return { visible, enabled, actionable, editable, clickable, focusable };
}

function inferEntryLocalContext(entry = {}, raw = {}) {
  const entryContext = entry.localContext ?? {};
  const activeDialog = selectActiveDialog(raw.dialogs ?? []);
  const formFallback = entry.withinForm ? raw.landmarks?.forms?.[0] ?? null : null;
  const dialogFallback =
    entry.withinDialog && activeDialog
      ? { name: activeDialog.name || activeDialog.label || '', css: activeDialog.css || '' }
      : entry.withinDialog
        ? raw.landmarks?.dialogs?.[0] ?? null
        : null;
  const headingFallback = raw.headings?.[0]
    ? { text: raw.headings[0].text, level: raw.headings[0].level ?? null, css: raw.headings[0].css || '' }
    : null;

  return {
    form: entryContext.form ?? formFallback,
    dialog: entryContext.dialog ?? dialogFallback,
    table: entryContext.table ?? null,
    list: entryContext.list ?? null,
    heading: entryContext.heading ?? headingFallback,
    section: entryContext.section ?? null,
    landmark: entryContext.landmark ?? null,
  };
}

function inferStableFingerprint(entry = {}, accessibleName = '') {
  return {
    role: entry.role || '',
    accessibleName,
    description: entry.description || '',
    testId: entry.testId || entry.attributes?.testId || '',
    context: {
      withinDialog: entry.withinDialog === true,
      withinForm: entry.withinForm === true,
      withinMain: entry.withinMain === true,
    },
  };
}

function inferConfidence(entry = {}, locators = [], actionability = { actionable: false }) {
  const reasons = [];
  let score = actionability.actionable ? 0.24 : 0.12;

  if (entry.role && (entry.name || entry.accessibleName)) {
    score += 0.36;
    reasons.push('semantic_role');
  }

  if (entry.label) {
    score += 0.2;
    reasons.push('label');
  } else if (entry.placeholder) {
    score += 0.1;
    reasons.push('placeholder');
  }

  if (entry.testId) {
    score += 0.18;
    reasons.push('test_id');
  }

  if (entry.withinDialog) {
    score += 0.11;
    reasons.push('in_dialog_context');
  } else if (entry.withinForm) {
    score += 0.11;
    reasons.push('in_form_context');
  }

  if (locators.length === 1 && locators[0]?.strategy === 'css') {
    score = Math.min(score, 0.34);
  }

  const roundedScore = Number(Math.min(score, 0.99).toFixed(2));
  return {
    level: roundedScore >= 0.8 ? 'high' : roundedScore >= 0.55 ? 'medium' : 'low',
    score: roundedScore,
    reasons,
  };
}

function enrichEntry(entry = {}, raw = {}) {
  const locators = buildLocatorCandidates(entry);
  const recommendedLocators = rankLocatorCandidates(entry);
  const accessibleName = compactText(entry.accessibleName || entry.name || entry.label || '');
  const visibleText = compactText(entry.visibleText || entry.text || entry.label || '');
  const description = compactText(entry.description || '');
  const state = inferEntryState(entry);
  const actionability = inferEntryActionability(entry);
  const localContext = inferEntryLocalContext(entry, raw);
  const geometry = normalizeGeometry(entry.geometry);
  const stableFingerprint = inferStableFingerprint(entry, accessibleName);
  const confidence = inferConfidence({ ...entry, accessibleName }, locators, actionability);

  return {
    ...entry,
    accessibleName,
    visibleText,
    description,
    attributes: {
      label: entry.label || '',
      placeholder: entry.placeholder || '',
      testId: entry.testId || '',
    },
    state,
    actionability,
    localContext,
    geometry,
    recommendedLocators,
    stableFingerprint,
    confidence,
    locators,
    preferredLocator: unwrapRankedLocator(recommendedLocators[0]) ?? locators[0] ?? null,
    fallbackLocators: recommendedLocators.slice(1).map((candidate) => unwrapRankedLocator(candidate)).filter(Boolean),
  };
}

function enrichInteractives(interactives = {}, raw = {}) {
  const enriched = {};

  for (const [groupName, entries] of Object.entries(interactives)) {
    enriched[groupName] = (entries ?? []).map((entry) => enrichEntry(entry, raw));
  }

  return enriched;
}

function pickByLimit(entries = [], limit) {
  return entries.slice(0, Number.isFinite(limit) ? limit : entries.length);
}

function buildDocument(raw, detailLevel, settings) {
  const dialogs = pickByLimit(raw.dialogs ?? raw.landmarks?.dialogs ?? [], settings.maxDialogs);
  const frames = pickByLimit(raw.frames ?? [], settings.maxFrames);
  const shadowHosts = pickByLimit(raw.shadowHosts ?? [], settings.maxShadowHosts);
  const mains = raw.landmarks?.mains ?? [];
  const forms = pickByLimit(raw.landmarks?.forms ?? [], settings.maxFormFields);
  const tables = pickByLimit(raw.tables ?? [], settings.maxLists);
  const lists = pickByLimit(raw.lists ?? [], settings.maxLists);
  const headings = pickByLimit(raw.headings ?? [], settings.maxHeadings);

  return {
    title: raw.title,
    url: raw.url,
    lang: raw.lang || undefined,
    readyState: raw.readyState || 'complete',
    description: detailLevel === 'brief' ? undefined : raw.description || undefined,
    dialogs,
    frames,
    shadowHosts,
    mains,
    regions: {
      main: mains,
      dialogs,
      forms,
      tables,
      lists,
      headings,
      frames,
      shadowRoots: shadowHosts,
    },
    detailLevel,
  };
}

function buildHints(raw, filteredEntries, detailLevel, settings) {
  const toLocatorReference = (candidate) => {
    const locator = unwrapRankedLocator(candidate);
    return locator ? { strategy: locator.strategy, value: locator.value } : null;
  };
  const toHintLocator = (entry) => {
    return toLocatorReference(entry.preferredLocator ?? entry.recommendedLocators?.[0] ?? buildLocatorCandidates(entry)[0]);
  };
  const toHintLocators = (entry) =>
    (entry.recommendedLocators ?? entry.locators ?? buildLocatorCandidates(entry))
      .map((candidate) => toLocatorReference(candidate))
      .filter(Boolean);

  const formFields = filteredEntries
    .filter((entry) => ['inputs', 'selects', 'textareas', 'checkboxes'].includes(entry.group))
    .slice(0, settings.maxFormFields)
    .map((entry) => ({
      label: entry.accessibleName || entry.visibleText || entry.label || entry.name || entry.text || '',
      kind: entry.group,
      value: entry.state?.value ?? entry.value ?? '',
      checked: entry.state?.checked ?? entry.checked ?? false,
      required: entry.state?.required ?? entry.required ?? false,
      locator: toHintLocator(entry),
      locators: toHintLocators(entry),
    }));

  const actionableEntries = filteredEntries.filter((entry) => ['buttons', 'links'].includes(entry.group));
  const activeDialog = selectActiveDialog(raw.dialogs ?? []);
  const primaryAction = selectPrimaryAction(actionableEntries, activeDialog);
  const possiblePrimaryForm = raw.landmarks?.forms?.[0] ?? null;
  const possibleResultRegions = (raw.lists ?? [])
    .filter((list) => (list.itemsCount ?? 0) >= 2)
    .slice(0, settings.maxLists)
    .map((list) => ({
      label: list.label || list.css || 'list',
      itemsCount: list.itemsCount ?? 0,
    }));

  return {
    activeDialog,
    formFields,
    primaryAction: primaryAction
      ? {
          label: primaryAction.accessibleName || primaryAction.visibleText || primaryAction.name || primaryAction.text || '',
          locator: toHintLocator(primaryAction),
          locators: toHintLocators(primaryAction),
        }
      : null,
    possiblePrimaryForm,
    possibleResultRegions,
    context: {
      hasFrames: (raw.frames?.length ?? 0) > 0,
      hasShadowHosts: (raw.shadowHosts?.length ?? 0) > 0,
      detailLevel,
    },
  };
}

export function normalizeRawScan(raw, detailLevel) {
  const settings = DETAIL_SETTINGS[detailLevel] ?? DETAIL_SETTINGS.standard;
  const discoveredEntries = flattenInteractives(raw.interactives);
  const retainedEntries = discoveredEntries.filter(shouldKeepInteractive).sort(compareInteractivePriority);
  const budgetedEntries = pickByLimit(retainedEntries, settings.maxInteractives);
  const regrouped = regroupInteractives(budgetedEntries);
  const enrichedInteractives = enrichInteractives(regrouped, raw);
  const enrichedRetainedEntries = retainedEntries.map((entry) => enrichEntry(entry, raw));

  return {
    ok: true,
    schemaVersion: 'scan.v2',
    title: raw.title,
    url: raw.url,
    detailLevel,
    document: buildDocument(raw, detailLevel, settings),
    summary: {
      mainText: clipText(raw.text, settings.mainTextChars),
      headings: pickByLimit(raw.headings ?? [], settings.maxHeadings),
      lists: pickByLimit(raw.lists ?? [], settings.maxLists),
      dialogs: pickByLimit(raw.dialogs ?? [], settings.maxDialogs),
      frames: pickByLimit(raw.frames ?? [], settings.maxFrames),
      shadowHosts: pickByLimit(raw.shadowHosts ?? [], settings.maxShadowHosts),
      retainedInteractiveCount: budgetedEntries.length,
      discoveredInteractiveCount: detailLevel === 'full' ? discoveredEntries.length : undefined,
      truncated: retainedEntries.length > budgetedEntries.length,
    },
    hints: buildHints(raw, enrichedRetainedEntries, detailLevel, settings),
    interactives: enrichedInteractives,
  };
}
