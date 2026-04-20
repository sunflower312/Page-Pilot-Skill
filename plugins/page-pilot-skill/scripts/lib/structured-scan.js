import { buildLocatorCandidates } from './locator-candidates.js';
import {
  buildBrowserInteractiveRuntimePayload,
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

const BROWSER_COLLECTION_SETTINGS = {
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

function normalizeRawScan(raw, detailLevel) {
  const settings = DETAIL_SETTINGS[detailLevel] ?? DETAIL_SETTINGS.standard;
  const discoveredEntries = flattenInteractives(raw.interactives);
  const retainedEntries = discoveredEntries.filter(shouldKeepInteractive).sort(compareInteractivePriority);
  const budgetedEntries = pickByLimit(retainedEntries, settings.maxInteractives);
  const regrouped = regroupInteractives(budgetedEntries);
  const enrichedInteractives = enrichInteractives(regrouped, raw);
  const enrichedRetainedEntries = retainedEntries.map((entry) => enrichEntry(entry, raw));

  return {
    ok: true,
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

export async function collectStructuredPageData(pageLike, { detailLevel = 'standard' } = {}) {
  const settings = BROWSER_COLLECTION_SETTINGS[detailLevel] ?? BROWSER_COLLECTION_SETTINGS.standard;
  const raw = await pageLike.evaluate(
    (payload, fixtureData) => {
      if (fixtureData) {
        return fixtureData;
      }

      const { settings } = payload;
      const instantiateInteractivePriorityRuntime = Function(
        `return (${payload.interactiveRuntimeInstantiatorSource})`
      )();
      const {
        compactText: compactTextInner,
        compareInteractivePriority: compareInteractivePriorityInner,
        finalizeInteractiveEntry,
      } = instantiateInteractivePriorityRuntime(payload);
      const interactiveInputTypes = new Set(['text', 'email', 'search', 'url', 'tel', 'password', 'number', '']);
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          parseFloat(style.opacity || '1') > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const getLabel = (element) => {
        const readLabelText = (node) => compactTextInner(node?.innerText || node?.textContent || '');
        const readLabeledByText = (ids) =>
          compactTextInner(
            String(ids || '')
              .split(/\s+/)
              .filter(Boolean)
              .map((id) => readLabelText(document.getElementById(id)))
              .filter(Boolean)
              .join(' ')
          );
        const readTableRowLabel = (control) => {
          const row = control.closest?.('tr');
          if (!row) {
            return '';
          }

          const cells = Array.from(row.children).filter((cell) => /^(td|th)$/i.test(cell.tagName));
          const ownerCell = control.closest?.('td,th');
          const ownerIndex = ownerCell ? cells.indexOf(ownerCell) : -1;
          if (ownerIndex <= 0) {
            return '';
          }

          for (let index = ownerIndex - 1; index >= 0; index -= 1) {
            const text = readLabelText(cells[index]);
            if (text) {
              return text;
            }
          }

          return '';
        };
        const readNearbyLabel = (control) => {
          const siblings = [control.previousElementSibling].filter(Boolean);
          for (const sibling of siblings) {
            const text = readLabelText(sibling);
            if (text) {
              return text;
            }
          }
          return '';
        };

        if (element.labels?.length) {
          return readLabelText(element.labels[0]);
        }
        if (element.id) {
          const explicit = readLabelText(document.querySelector(`label[for="${element.id}"]`));
          if (explicit) {
            return explicit;
          }
        }
        const wrapped = readLabelText(element.closest?.('label'));
        if (wrapped) {
          return wrapped;
        }
        const labelledBy = readLabeledByText(element.getAttribute('aria-labelledby'));
        if (labelledBy) {
          return labelledBy;
        }
        const tableRowLabel = readTableRowLabel(element);
        if (tableRowLabel) {
          return tableRowLabel;
        }
        return readNearbyLabel(element);
      };
      const getElementText = (element) =>
        compactTextInner(
          element.innerText ||
            element.textContent ||
            (element.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((element.getAttribute('type') || '').toLowerCase())
              ? element.value
              : '') ||
            ''
        );
      const getName = (element) =>
        compactTextInner(
          element.getAttribute('aria-label') ||
            getElementText(element) ||
            getLabel(element) ||
            element.getAttribute('placeholder') ||
            ''
        );
      const getDescription = (element) => {
        const describedBy = compactTextInner(element.getAttribute('aria-describedby') || '');
        const describedByText = describedBy
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => compactTextInner(document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || ''))
          .filter(Boolean)
          .join(' ');

        return compactTextInner(element.getAttribute('aria-description') || describedByText || element.getAttribute('title') || '');
      };
      const getGeometry = (element) => {
        const rect = element.getBoundingClientRect();
        if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
          return null;
        }
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          viewportVisibleRatio: Number(
            Math.max(
              0,
              Math.min(1, (Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)) / Math.max(rect.height, 1))
            ).toFixed(2)
          ),
        };
      };
      const escapeCssIdentifier = (value) => {
        const source = String(value ?? '');
        if (globalThis.CSS?.escape) {
          return globalThis.CSS.escape(source);
        }
        return source.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, (match, digit) => (digit ? `\\3${digit} ` : `\\${match}`));
      };
      const escapeCssAttributeValue = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const getCss = (element) => {
        if (element.id) {
          return `#${escapeCssIdentifier(element.id)}`;
        }
        if (element.getAttribute('data-testid')) {
          return `${element.tagName.toLowerCase()}[data-testid="${escapeCssAttributeValue(element.getAttribute('data-testid'))}"]`;
        }
        if (element.getAttribute('name')) {
          return `${element.tagName.toLowerCase()}[name="${escapeCssAttributeValue(element.getAttribute('name'))}"]`;
        }
        return element.tagName.toLowerCase();
      };
      const pushIfRoom = (entries, limit, entry) => {
        if (entries.length >= limit) {
          return false;
        }
        entries.push(entry);
        return true;
      };
      const hasClosestMatch = (element, owner, selector) =>
        Boolean(element.closest?.(selector)) || Boolean(owner !== element && owner?.closest?.(selector));
      const getClosestContextElement = (element, owner, selector) => owner?.closest?.(selector) || element.closest?.(selector) || null;
      const getContextFlags = (element, owner = element) => ({
        withinMain: hasClosestMatch(element, owner, 'main,[role="main"]'),
        withinForm: hasClosestMatch(element, owner, 'form'),
        withinDialog: hasClosestMatch(element, owner, 'dialog,[role="dialog"]'),
        withinHeader: hasClosestMatch(element, owner, 'header,[role="banner"]'),
        withinFooter: hasClosestMatch(element, owner, 'footer,[role="contentinfo"]'),
        withinNav: hasClosestMatch(element, owner, 'nav,[role="navigation"]'),
        withinAside: hasClosestMatch(element, owner, 'aside,[role="complementary"]'),
      });
      const getHeadingContext = (element, owner = element) => {
        const scope =
          getClosestContextElement(element, owner, 'section,article,form,dialog,[role="dialog"],main,[role="main"]') ?? document.body;
        const heading = scope?.querySelector?.('h1,h2,h3,h4,h5,h6,[role="heading"]');
        if (!heading) {
          return null;
        }
        return {
          text: compactTextInner(heading.innerText || heading.textContent || ''),
          level: /^h[1-6]$/i.test(heading.tagName) ? Number(heading.tagName.slice(1)) : null,
          css: getCss(heading),
        };
      };
      const buildContextSummary = (contextElement) => {
        if (!contextElement) {
          return null;
        }
        return {
          name:
            compactTextInner(
              contextElement.getAttribute?.('aria-label') ||
                contextElement.getAttribute?.('name') ||
                contextElement.getAttribute?.('id') ||
                contextElement.innerText ||
                contextElement.textContent ||
                ''
            ) || '',
          css: getCss(contextElement),
        };
      };
      const getLocalContext = (element, owner = element) => {
        const form = getClosestContextElement(element, owner, 'form');
        const dialog = getClosestContextElement(element, owner, 'dialog,[role="dialog"]');
        const table = getClosestContextElement(element, owner, 'table,[role="table"],[role="grid"]');
        const list = getClosestContextElement(element, owner, 'ul,ol,[role="list"]');
        const section = getClosestContextElement(element, owner, 'section,article');
        const landmark = getClosestContextElement(
          element,
          owner,
          'main,[role="main"],nav,[role="navigation"],aside,[role="complementary"],header,[role="banner"],footer,[role="contentinfo"]'
        );

        return {
          form: buildContextSummary(form),
          dialog: buildContextSummary(dialog),
          table: buildContextSummary(table),
          list: buildContextSummary(list),
          heading: getHeadingContext(element, owner),
          section: buildContextSummary(section),
          landmark: buildContextSummary(landmark),
        };
      };
      const isHigherPriorityEntry = (left, right) => compareInteractivePriorityInner(left, right) < 0;
      const insertInteractiveEntry = (entries, limit, entry) => {
        if (entries.length < limit) {
          entries.push(entry);
          return;
        }

        let worstIndex = 0;
        for (let index = 1; index < entries.length; index += 1) {
          if (isHigherPriorityEntry(entries[worstIndex], entries[index])) {
            worstIndex = index;
          }
        }

        if (isHigherPriorityEntry(entry, entries[worstIndex])) {
          entries[worstIndex] = entry;
        }
      };
      const shadowTextSnippets = [];
      const raw = {
        title: document.title,
        url: window.location.href,
        lang: document.documentElement.lang || undefined,
        readyState: document.readyState,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
        text: '',
        headings: [],
        lists: [],
        tables: [],
        interactives: {
          buttons: [],
          links: [],
          inputs: [],
          selects: [],
          textareas: [],
          checkboxes: [],
        },
        landmarks: {
          forms: [],
          dialogs: [],
          mains: [],
        },
        dialogs: [],
        frames: [],
        shadowHosts: [],
      };
      const interactiveLimits = {
        buttons: settings.maxButtons,
        links: settings.maxLinks,
        inputs: settings.maxInputs,
        selects: settings.maxSelects,
        textareas: settings.maxTextareas,
        checkboxes: settings.maxCheckboxes,
      };
      const mapFormControl = (element, meta = {}) => {
        const owner = meta.host ?? element;
        const tagName = element.tagName.toLowerCase();
        const css = `${meta.hostCss ? `${meta.hostCss} ` : ''}${getCss(element)}`.trim();
        const context = getContextFlags(element, owner);
        const base = {
          name: getName(element),
          label: getLabel(element),
          description: getDescription(element),
          testId: element.getAttribute('data-testid') || '',
          css,
          visible: isVisible(owner) && isVisible(element),
          disabled: Boolean(element.disabled),
          ariaDisabled: element.getAttribute('aria-disabled'),
          required: element.required === true || element.getAttribute('aria-required') === 'true',
          readonly: element.readOnly === true || element.getAttribute('aria-readonly') === 'true',
          geometry: getGeometry(element),
          localContext: getLocalContext(element, owner),
          domIndex: meta.anchorIndex ?? -1,
          fromShadow: Boolean(meta.host),
          ...context,
        };

        if (tagName === 'select') {
          return {
            group: 'selects',
            entry: finalizeInteractiveEntry({
              ...base,
              role: 'combobox',
              value: element.value || '',
              selectedText: compactTextInner(element.selectedOptions?.[0]?.innerText || ''),
            }),
          };
        }
        if (tagName === 'textarea') {
          return {
            group: 'textareas',
            entry: finalizeInteractiveEntry({
              ...base,
              role: 'textbox',
              placeholder: element.getAttribute('placeholder') || '',
              value: element.value || '',
            }),
          };
        }

        const inputType = (element.type || '').toLowerCase();
        if (inputType === 'checkbox') {
          return {
            group: 'checkboxes',
            entry: finalizeInteractiveEntry({
              ...base,
              role: 'checkbox',
              checked: element.checked === true,
            }),
          };
        }
        if (!interactiveInputTypes.has(inputType)) {
          return null;
        }

        return {
          group: 'inputs',
          entry: finalizeInteractiveEntry({
            ...base,
            role: inputType === 'search' ? 'searchbox' : 'textbox',
            text: getLabel(element) || getName(element),
            placeholder: element.getAttribute('placeholder') || '',
            inputType,
            value: element.value || '',
          }),
        };
      };
      const addInteractiveEntry = (group, entry) => {
        insertInteractiveEntry(raw.interactives[group], interactiveLimits[group], { ...entry, group });
      };
      const addButton = (element, meta = {}) => {
        const owner = meta.host ?? element;
        const context = getContextFlags(element, owner);
        const entry = finalizeInteractiveEntry({
          role: 'button',
          name: getName(element),
          text: getElementText(element),
          description: getDescription(element),
          testId: element.getAttribute('data-testid') || '',
          css: `${meta.hostCss ? `${meta.hostCss} ` : ''}${getCss(element)}`.trim(),
          visible: isVisible(owner) && isVisible(element),
          disabled: Boolean(element.disabled),
          ariaDisabled: element.getAttribute('aria-disabled'),
          isSubmitControl: element.getAttribute('type') === 'submit',
          geometry: getGeometry(element),
          localContext: getLocalContext(element, owner),
          focusable: typeof element.tabIndex === 'number' ? element.tabIndex >= 0 : true,
          domIndex: meta.anchorIndex ?? -1,
          fromShadow: Boolean(meta.host),
          ...context,
        });
        addInteractiveEntry('buttons', entry);
      };
      const addLink = (element, domIndex) => {
        const context = getContextFlags(element, element);
        const entry = finalizeInteractiveEntry({
          role: 'link',
          name: getName(element),
          text: compactTextInner(element.innerText || ''),
          description: getDescription(element),
          testId: element.getAttribute('data-testid') || '',
          href: element.getAttribute('href') || '',
          css: getCss(element),
          visible: isVisible(element),
          disabled: Boolean(element.disabled),
          ariaDisabled: element.getAttribute('aria-disabled'),
          geometry: getGeometry(element),
          localContext: getLocalContext(element, element),
          focusable: typeof element.tabIndex === 'number' ? element.tabIndex >= 0 : true,
          domIndex,
          ...context,
        });
        addInteractiveEntry('links', entry);
      };
      const addFormControl = (element, meta = {}) => {
        const mapped = mapFormControl(element, meta);
        if (!mapped) {
          return;
        }
        addInteractiveEntry(mapped.group, mapped.entry);
      };
      const addDialog = (element) => {
        const entry = {
          name: getName(element),
          text: compactTextInner(element.innerText || element.textContent || ''),
          open: element.open === true || (element.getAttribute('aria-hidden') !== 'true' && isVisible(element)),
          css: getCss(element),
        };
        if (pushIfRoom(raw.dialogs, settings.maxDialogs, entry)) {
          pushIfRoom(raw.landmarks.dialogs, settings.maxDialogs, { name: entry.name });
        }
      };
      const addHeading = (element) => {
        const entry = {
          level: Number(element.tagName.slice(1)),
          text: compactTextInner(element.innerText || element.textContent || ''),
          css: getCss(element),
        };
        if (entry.text) {
          pushIfRoom(raw.headings, settings.maxHeadings, entry);
        }
      };
      const addList = (element) => {
        const items = Array.from(element.querySelectorAll(':scope > li'))
          .map((item) => compactTextInner(item.innerText || item.textContent || ''))
          .filter(Boolean);
        if (items.length > 0) {
          pushIfRoom(raw.lists, settings.maxLists, {
            label: element.getAttribute('aria-label') || element.getAttribute('id') || '',
            itemsCount: items.length,
            itemsPreview: items.slice(0, 3),
            css: getCss(element),
          });
        }
      };
      const addTable = (element) => {
        const headers = Array.from(element.querySelectorAll('th'))
          .map((header) => compactTextInner(header.innerText || header.textContent || ''))
          .filter(Boolean);
        pushIfRoom(raw.tables, settings.maxLists, {
          label: element.getAttribute('aria-label') || element.getAttribute('id') || '',
          headers: headers.slice(0, 5),
          css: getCss(element),
        });
      };
      const addFrame = (element) => {
        pushIfRoom(raw.frames, settings.maxFrames, {
          name: element.getAttribute('name') || '',
          title: element.getAttribute('title') || '',
          src: element.getAttribute('src') || '',
          text: (() => {
            if (!settings.includeFrameText) {
              return '';
            }
            try {
              return compactTextInner(element.contentDocument?.body?.innerText || '');
            } catch {
              return '';
            }
          })(),
        });
      };
      const registerShadowHost = (host, meta) => {
        const shadowText = compactTextInner(host.shadowRoot?.textContent || '');
        if (shadowText) {
          shadowTextSnippets.push(shadowText);
        }
        if (
          !pushIfRoom(raw.shadowHosts, settings.maxShadowHosts, {
            tag: host.tagName.toLowerCase(),
            css: meta.hostCss,
            text: shadowText,
          })
        ) {
          return;
        }

        if (settings.includeShadowInteractives) {
          Array.from(host.shadowRoot.querySelectorAll('input,textarea,select')).forEach((element) =>
            addFormControl(element, {
              host,
              anchorIndex: meta.anchorIndex,
              hostCss: meta.hostCss,
            })
          );
          Array.from(host.shadowRoot.querySelectorAll('button,input[type="button"],input[type="submit"]')).forEach((element) =>
            addButton(element, {
              host,
              anchorIndex: meta.anchorIndex,
              hostCss: meta.hostCss,
            })
          );
        }

        if (!settings.discoverNestedShadowHosts) {
          return;
        }

        const nestedHosts = Array.from(host.shadowRoot.querySelectorAll('*')).filter((element) => element.shadowRoot);
        for (const nestedHost of nestedHosts) {
          if (raw.shadowHosts.length >= settings.maxShadowHosts) {
            break;
          }
          registerShadowHost(nestedHost, {
            anchorIndex: meta.anchorIndex,
            hostCss: `${meta.hostCss} ${getCss(nestedHost)}`.trim(),
          });
        }
      };

      const root = document.body ?? document.documentElement;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let domIndex = 0;

      while (walker.nextNode()) {
        const element = walker.currentNode;
        const tagName = element.tagName.toLowerCase();
        const currentDomIndex = domIndex;
        domIndex += 1;

        if (tagName === 'form') {
          pushIfRoom(raw.landmarks.forms, settings.maxForms, {
            name: element.getAttribute('id') || element.getAttribute('name') || '',
          });
        }

        if (tagName === 'main' || element.getAttribute('role') === 'main') {
          pushIfRoom(raw.landmarks.mains, settings.maxMains, {
            name: getName(element),
          });
        }

        if (tagName === 'dialog' || element.getAttribute('role') === 'dialog') {
          addDialog(element);
        }

        if (/^h[1-6]$/.test(tagName)) {
          addHeading(element);
        }

        if (tagName === 'ul' || tagName === 'ol') {
          addList(element);
        }

        if (tagName === 'table' || element.getAttribute('role') === 'table' || element.getAttribute('role') === 'grid') {
          addTable(element);
        }

        if (tagName === 'iframe') {
          addFrame(element);
        }

        if (tagName === 'button' || (tagName === 'input' && ['button', 'submit'].includes((element.type || '').toLowerCase()))) {
          addButton(element, { anchorIndex: currentDomIndex });
        } else if (tagName === 'a' && element.hasAttribute('href')) {
          addLink(element, currentDomIndex);
        } else if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          addFormControl(element, { anchorIndex: currentDomIndex });
        }

        if (element.shadowRoot && raw.shadowHosts.length < settings.maxShadowHosts) {
          registerShadowHost(element, {
            anchorIndex: currentDomIndex,
            hostCss: getCss(element),
          });
        }
      }

      raw.text = compactTextInner([document.body?.innerText ?? '', ...shadowTextSnippets].join(' '));

      return raw;
    },
    buildBrowserInteractiveRuntimePayload({
      detailLevel,
      settings,
    })
  );

  return normalizeRawScan(raw, detailLevel);
}
