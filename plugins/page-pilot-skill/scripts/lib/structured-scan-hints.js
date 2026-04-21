import { buildLocatorCandidates } from './locator-candidates.js';
import { unwrapRankedLocator } from './locator-ranking.js';
import { selectActiveDialog, selectPrimaryAction } from './semantic-model.js';

function toLocatorReference(candidate) {
  const locator = unwrapRankedLocator(candidate);
  return locator ? { strategy: locator.strategy, value: locator.value } : null;
}

function toHintLocator(entry) {
  return toLocatorReference(entry.preferredLocator ?? entry.recommendedLocators?.[0] ?? buildLocatorCandidates(entry)[0]);
}

function toHintLocators(entry) {
  return (entry.recommendedLocators ?? entry.locators ?? buildLocatorCandidates(entry))
    .map((candidate) => toLocatorReference(candidate))
    .filter(Boolean);
}

export function buildHints(raw, filteredEntries, detailLevel, settings, collections) {
  const formFields = filteredEntries
    .filter((entry) => ['inputs', 'selects', 'textareas', 'checkboxes', 'radios', 'switches', 'fileInputs', 'dateInputs'].includes(entry.group))
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
  const possibleResultRegions = (collections?.resultRegions ?? []).slice(0, settings.maxLists);
  const primaryCollection = collections?.resultRegions?.[0]
    ? {
        kind: collections.resultRegions[0].kind,
        label: collections.resultRegions[0].label,
      }
    : null;

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
    primaryCollection,
    context: {
      hasFrames: (raw.frames?.length ?? 0) > 0,
      hasShadowHosts: (raw.shadowHosts?.length ?? 0) > 0,
      detailLevel,
    },
  };
}
