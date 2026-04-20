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

function refreshScanHints(scan = {}) {
  const retainedEntries = Object.values(scan.interactives ?? {}).flat();
  const formFieldLimit = scan.hints?.formFields?.length ?? 0;
  const activeDialog = selectActiveDialog(scan.document?.dialogs ?? []);
  const primaryAction = selectPrimaryAction(
    retainedEntries.filter((entry) => ['buttons', 'links'].includes(entry.group)),
    activeDialog
  );

  if (Array.isArray(scan.hints?.formFields)) {
    scan.hints.formFields = retainedEntries
      .filter((entry) => ['inputs', 'selects', 'textareas', 'checkboxes'].includes(entry.group))
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

async function enrichScanWithLocatorVerification(pageLike, scan, verification = {}) {
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
  const highValueEntries = [
    ...(scan.hints?.primaryAction?.label
      ? scan.interactives.buttons.filter((entry) => entry.accessibleName === scan.hints.primaryAction.label).slice(0, 1)
      : []),
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
    const choices = await buildLocatorChoices(pageLike, entry.recommendedLocators.slice(0, maxPerElement), entry.group === 'inputs' ? 'fill' : 'click');
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
          unique: choice.matchCount === 1,
          matchCount: choice.matchCount,
          visible: entry.actionability?.visible ?? null,
          enabled: entry.actionability?.enabled ?? null,
          action: entry.group === 'inputs' ? 'fill' : 'click',
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

  return enrichScanWithLocatorVerification(pageLike, normalized, verification);
}
