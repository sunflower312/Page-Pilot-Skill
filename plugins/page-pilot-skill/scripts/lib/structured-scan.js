import { buildLocatorChoices } from '../tools/locator-choices.js';
import { buildBrowserInteractiveRuntimePayload } from './interactive-priority.js';
import { selectActiveDialog, selectPrimaryAction } from './semantic-model.js';
import { BROWSER_COLLECTION_SETTINGS, normalizeRawScan } from './structured-scan-shaping.js';
import { collectStructuredPageDataRuntime } from './structured-scan-runtime.js';

function toLocatorReference(candidate = null) {
  if (!candidate) {
    return null;
  }

  return candidate.locator?.strategy ? candidate.locator : candidate.strategy ? candidate : null;
}

function syncEntryLocatorSelections(entry = {}) {
  const normalizedLocators = (entry.recommendedLocators ?? []).map((candidate) => toLocatorReference(candidate)).filter(Boolean);
  entry.locators = normalizedLocators;
  entry.preferredLocator = normalizedLocators[0] ?? null;
  entry.fallbackLocators = normalizedLocators.slice(1);
  return entry;
}

function toHintLocators(entry = {}) {
  return (entry.recommendedLocators ?? []).map((candidate) => toLocatorReference(candidate)).filter(Boolean);
}

function toHintLocator(entry = {}) {
  return toHintLocators(entry)[0] ?? null;
}

function locatorsEqual(left, right) {
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function findPrimaryActionEntry(scan = {}, retainedEntries = []) {
  const primaryAction = scan.hints?.primaryAction;
  if (!primaryAction) {
    return null;
  }

  return (
    retainedEntries.find((entry) => {
      if (!['buttons', 'links'].includes(entry.group)) {
        return false;
      }

      return (
        (primaryAction.locator && toHintLocators(entry).some((locator) => locatorsEqual(locator, primaryAction.locator))) ||
        (primaryAction.label &&
          [entry.accessibleName, entry.visibleText, entry.label, entry.name, entry.text].filter(Boolean).includes(primaryAction.label))
      );
    }) ?? null
  );
}

function getVerificationActionForEntry(entry = {}) {
  if (['inputs', 'textareas', 'dateInputs'].includes(entry.group)) {
    return 'fill';
  }
  if (['selects', 'options'].includes(entry.group)) {
    return 'select';
  }
  if (['checkboxes', 'radios', 'switches'].includes(entry.group)) {
    return 'check';
  }
  if (entry.group === 'fileInputs') {
    return 'set_files';
  }
  return 'click';
}

function refreshScanHints(scan = {}) {
  const retainedEntries = [...Object.values(scan.interactives ?? {}).flat(), ...Object.values(scan.specializedControls ?? {}).flat()];
  const formFieldLimit = scan.hints?.formFields?.length ?? 0;
  const activeDialog = selectActiveDialog(scan.document?.dialogs ?? []);
  const primaryAction = selectPrimaryAction(
    retainedEntries.filter((entry) => ['buttons', 'links'].includes(entry.group)),
    activeDialog
  );

  if (Array.isArray(scan.hints?.formFields)) {
    scan.hints.formFields = retainedEntries
      .filter((entry) => ['inputs', 'selects', 'textareas', 'checkboxes', 'radios', 'switches', 'fileInputs', 'dateInputs'].includes(entry.group))
      .slice(0, formFieldLimit)
      .map((entry) => ({
        label: entry.accessibleName || entry.visibleText || entry.label || entry.name || entry.text || '',
        kind: entry.group,
        value: entry.state?.value ?? entry.value ?? '',
        checked: entry.state?.checked ?? entry.checked ?? false,
        required: entry.state?.required ?? entry.required ?? false,
        locator: toHintLocator(entry),
        locators: toHintLocators(entry),
      }));
  }

  if (scan.hints) {
    scan.hints.primaryAction = primaryAction
      ? {
          label: primaryAction.accessibleName || primaryAction.visibleText || primaryAction.name || primaryAction.text || '',
          locator: toHintLocator(primaryAction),
          locators: toHintLocators(primaryAction),
        }
      : null;
  }

  return scan;
}

export async function enrichScanWithLocatorVerification(pageLike, scan, verification = {}, { buildChoices = buildLocatorChoices } = {}) {
  if (verification?.enabled !== true) {
    return scan;
  }

  const allowedGroups = new Set(
    verification.groups ?? [
      'buttons',
      'links',
      'inputs',
      'selects',
      'textareas',
      'checkboxes',
      'radios',
      'switches',
      'sliders',
      'tabs',
      'options',
      'menuItems',
      'fileInputs',
      'dateInputs',
    ]
  );
  const maxPerElement = Math.max(1, Math.min(verification.maxPerElement ?? 1, 2));
  const retainedEntries = [...Object.values(scan.interactives ?? {}).flat(), ...Object.values(scan.specializedControls ?? {}).flat()];
  const primaryActionEntry = findPrimaryActionEntry(scan, retainedEntries);
  const highValueEntries = [
    ...(primaryActionEntry ? [primaryActionEntry] : []),
    ...retainedEntries
      .filter((entry) => allowedGroups.has(entry.group))
      .slice(0, 6),
  ];
  const seen = new Set();

  for (const entry of highValueEntries) {
    const key = entry.id ?? `${entry.group}:${entry.css}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const verificationAction = getVerificationActionForEntry(entry);
    const choices = await buildChoices(pageLike, entry.recommendedLocators.slice(0, maxPerElement), verificationAction);
    entry.recommendedLocators = entry.recommendedLocators.map((candidate, index) => {
      const choice = choices[index];
      if (!choice) {
        return candidate;
      }
      return {
        ...candidate,
        ...choice,
        matchCount: choice.matchCount,
        playwrightExpression: choice.playwrightExpression,
        verification: {
          attempted: true,
          unique: choice.inspection?.unique ?? choice.matchCount === 1,
          matchCount: choice.inspection?.count ?? choice.matchCount,
          visible: choice.inspection?.visible ?? null,
          enabled: choice.inspection?.enabled ?? null,
          editable: choice.inspection?.editable ?? null,
          actionable: choice.inspection?.actionable ?? null,
          usable: choice.inspection?.usable ?? null,
          failureCode: choice.inspection?.failureCode ?? null,
          message: choice.inspection?.message ?? null,
          action: verificationAction,
          source: 'scan',
        },
      };
    });
    syncEntryLocatorSelections(entry);
  }

  return refreshScanHints(scan);
}

export async function collectStructuredPageData(
  pageLike,
  { detailLevel = 'standard', focus = { kind: 'generic' }, includeSpecializedControls = false, verification = { enabled: false } } = {}
) {
  const settings = BROWSER_COLLECTION_SETTINGS[detailLevel] ?? BROWSER_COLLECTION_SETTINGS.standard;
  const raw = await pageLike.evaluate(
    collectStructuredPageDataRuntime,
    buildBrowserInteractiveRuntimePayload({
      detailLevel,
      focus,
      settings,
    })
  );

  const normalized = normalizeRawScan(raw, {
    detailLevel,
    focus,
    includeSpecializedControls,
    collectionSettings: settings,
  });
  const enriched = await enrichScanWithLocatorVerification(pageLike, normalized, verification);
  return {
    ok: true,
    ...enriched,
  };
}
