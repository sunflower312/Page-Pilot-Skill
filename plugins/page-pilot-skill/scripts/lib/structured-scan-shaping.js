import { buildLocatorCandidates } from './locator-candidates.js';
import {
  clipText,
  compactText,
  createInteractivePriorityRuntime,
} from './interactive-priority.js';
import { rankLocatorCandidates, unwrapRankedLocator } from './locator-ranking.js';
import { selectActiveDialog } from './semantic-model.js';
import { buildCollections, pickByLimit } from './structured-scan-collections.js';
import { buildCoverage, sumCoverageGroupCounts } from './structured-scan-coverage.js';
import { createScanFocusSummary, normalizeScanFocus } from './structured-scan-focus.js';
import { buildHints } from './structured-scan-hints.js';

const DETAIL_SETTINGS = {
  brief: {
    maxInteractives: 6,
    maxSpecializedPerGroup: 2,
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
    maxSpecializedPerGroup: 3,
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
    maxSpecializedPerGroup: 6,
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
    maxRadios: 2,
    maxSwitches: 2,
    maxSliders: 2,
    maxTabs: 3,
    maxOptions: 3,
    maxMenuItems: 3,
    maxFileInputs: 2,
    maxDateInputs: 2,
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
    maxRadios: 3,
    maxSwitches: 3,
    maxSliders: 3,
    maxTabs: 4,
    maxOptions: 4,
    maxMenuItems: 4,
    maxFileInputs: 2,
    maxDateInputs: 2,
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
    maxRadios: 6,
    maxSwitches: 6,
    maxSliders: 6,
    maxTabs: 8,
    maxOptions: 8,
    maxMenuItems: 8,
    maxFileInputs: 4,
    maxDateInputs: 4,
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

function regroupSpecialized(entries = []) {
  const groups = {
    radios: [],
    switches: [],
    sliders: [],
    tabs: [],
    options: [],
    menuItems: [],
    fileInputs: [],
    dateInputs: [],
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

function inferProvenance(entry = {}) {
  return {
    roleSource: entry.roleSource || 'native_tag',
    nameSource: entry.nameSource || 'none',
    labelSource: entry.labelSource || 'none',
    descriptionSource: entry.descriptionSource || 'none',
    origin: entry.fromShadow ? 'shadow_dom' : 'document',
  };
}

function inferOrigin(entry = {}) {
  return {
    fromShadow: entry.fromShadow === true,
    shadowHostCss: entry.fromShadow ? entry.css?.split(' ').slice(0, -1).join(' ') || '' : '',
    frameName: entry.frameName || '',
    frameTitle: entry.frameTitle || '',
    sameOriginFrame: entry.sameOriginFrame ?? null,
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
  const nameSource = entry.nameSource || entry.provenance?.nameSource || 'none';
  const labelSource = entry.labelSource || entry.provenance?.labelSource || 'none';

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

  if (nameSource === 'placeholder') {
    score -= 0.08;
    reasons.push('placeholder_name_source');
  } else if (['aria-label', 'aria-labelledby', 'label', 'wrapped-label'].includes(nameSource)) {
    score += 0.06;
    reasons.push('strong_name_source');
  }

  if (['label', 'wrapped-label', 'aria-labelledby', 'table-row'].includes(labelSource)) {
    score += 0.04;
    reasons.push('strong_label_source');
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
  const provenance = inferProvenance(entry);
  const origin = inferOrigin(entry);

  return {
    ...entry,
    id: entry.id || `scan-${entry.group}-${entry.domIndex ?? 'x'}-${(entry.css || entry.accessibleName || entry.visibleText || 'entry')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)}`,
    accessibleName,
    visibleText,
    description,
    attributes: {
      label: entry.label || '',
      placeholder: entry.placeholder || '',
      testId: entry.testId || '',
      inputType: entry.inputType || '',
      href: entry.href || '',
      controlType: entry.controlType || '',
    },
    state,
    actionability,
    localContext,
    provenance,
    origin,
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

export function normalizeRawScan(raw, options = {}) {
  const detailLevel = typeof options === 'string' ? options : options.detailLevel ?? 'standard';
  const focus = normalizeScanFocus(typeof options === 'string' ? { kind: 'generic' } : options.focus ?? { kind: 'generic' });
  const includeSpecializedControls = typeof options === 'string' ? false : options.includeSpecializedControls === true;
  const collectionSettings = typeof options === 'string' ? BROWSER_COLLECTION_SETTINGS[detailLevel] : options.collectionSettings ?? BROWSER_COLLECTION_SETTINGS[detailLevel];
  const settings = DETAIL_SETTINGS[detailLevel] ?? DETAIL_SETTINGS.standard;
  const priorityRuntime = createInteractivePriorityRuntime({ focus });
  const discoveredEntries = flattenInteractives(raw.interactives);
  const retainedEntries = discoveredEntries
    .filter((entry) => priorityRuntime.shouldKeepInteractive(entry))
    .sort(priorityRuntime.compareInteractivePriority);
  const budgetedEntries = pickByLimit(retainedEntries, settings.maxInteractives);
  const regrouped = regroupInteractives(budgetedEntries);
  const enrichedInteractives = enrichInteractives(regrouped, raw);
  const enrichedRetainedEntries = retainedEntries.map((entry) => enrichEntry(entry, raw));
  const specializedEntries = flattenInteractives(raw.specializedControls ?? {})
    .filter((entry) => priorityRuntime.shouldKeepInteractive(entry))
    .sort(priorityRuntime.compareInteractivePriority);
  const groupedSpecialized = regroupSpecialized(
    specializedEntries.flatMap((entry) => [enrichEntry(entry, raw)]).filter(Boolean)
  );
  for (const [groupName, entries] of Object.entries(groupedSpecialized)) {
    groupedSpecialized[groupName] = pickByLimit(entries, settings.maxSpecializedPerGroup);
  }
  const retainedHintEntries = [
    ...budgetedEntries.map((entry) => enrichEntry(entry, raw)),
    ...(includeSpecializedControls ? Object.values(groupedSpecialized).flat() : []),
  ].sort(priorityRuntime.compareInteractivePriority);
  const collections = buildCollections(raw, settings);
  const visibleSpecialized = includeSpecializedControls ? groupedSpecialized : regroupSpecialized([]);
  const coverage = buildCoverage(raw, regrouped, visibleSpecialized, settings, collectionSettings, includeSpecializedControls);
  const discoveredInteractiveCount = sumCoverageGroupCounts(coverage.discoveredByGroup);
  const retainedInteractiveCount = sumCoverageGroupCounts(coverage.retainedByGroup);
  const truncated = sumCoverageGroupCounts(coverage.omittedByGroup) > 0;

  return {
    schemaVersion: 'scan.v3',
    title: raw.title,
    url: raw.url,
    detailLevel,
    focus: createScanFocusSummary(focus),
    document: buildDocument(raw, detailLevel, settings),
    summary: {
      mainText: clipText(raw.text, settings.mainTextChars),
      headings: pickByLimit(raw.headings ?? [], settings.maxHeadings),
      lists: pickByLimit(raw.lists ?? [], settings.maxLists),
      dialogs: pickByLimit(raw.dialogs ?? [], settings.maxDialogs),
      frames: pickByLimit(raw.frames ?? [], settings.maxFrames),
      shadowHosts: pickByLimit(raw.shadowHosts ?? [], settings.maxShadowHosts),
      retainedInteractiveCount,
      discoveredInteractiveCount,
      truncated,
      coverage,
    },
    hints: buildHints(raw, retainedHintEntries, detailLevel, settings, collections),
    interactives: enrichedInteractives,
    specializedControls: visibleSpecialized,
    collections,
  };
}
