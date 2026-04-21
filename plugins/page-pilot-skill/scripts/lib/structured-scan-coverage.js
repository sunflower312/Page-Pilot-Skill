function emptySpecializedCoverageCounts() {
  return {
    radios: 0,
    switches: 0,
    sliders: 0,
    tabs: 0,
    options: 0,
    menuItems: 0,
    fileInputs: 0,
    dateInputs: 0,
  };
}

export function buildCoverage(
  raw = {},
  groupedInteractives = {},
  groupedSpecialized = {},
  settings = {},
  collectionSettings = {},
  includeSpecializedControls = false
) {
  const retainedByGroup = {
    buttons: groupedInteractives.buttons?.length ?? 0,
    links: groupedInteractives.links?.length ?? 0,
    inputs: groupedInteractives.inputs?.length ?? 0,
    selects: groupedInteractives.selects?.length ?? 0,
    textareas: groupedInteractives.textareas?.length ?? 0,
    checkboxes: groupedInteractives.checkboxes?.length ?? 0,
    specialized: includeSpecializedControls
      ? {
          radios: groupedSpecialized.radios?.length ?? 0,
          switches: groupedSpecialized.switches?.length ?? 0,
          sliders: groupedSpecialized.sliders?.length ?? 0,
          tabs: groupedSpecialized.tabs?.length ?? 0,
          options: groupedSpecialized.options?.length ?? 0,
          menuItems: groupedSpecialized.menuItems?.length ?? 0,
          fileInputs: groupedSpecialized.fileInputs?.length ?? 0,
          dateInputs: groupedSpecialized.dateInputs?.length ?? 0,
        }
      : emptySpecializedCoverageCounts(),
  };
  const discoveredByGroup = {
    buttons: raw.discoveredCounts?.buttons ?? raw.interactives?.buttons?.length ?? 0,
    links: raw.discoveredCounts?.links ?? raw.interactives?.links?.length ?? 0,
    inputs: raw.discoveredCounts?.inputs ?? raw.interactives?.inputs?.length ?? 0,
    selects: raw.discoveredCounts?.selects ?? raw.interactives?.selects?.length ?? 0,
    textareas: raw.discoveredCounts?.textareas ?? raw.interactives?.textareas?.length ?? 0,
    checkboxes: raw.discoveredCounts?.checkboxes ?? raw.interactives?.checkboxes?.length ?? 0,
    specialized: includeSpecializedControls
      ? {
          radios: raw.discoveredCounts?.specialized?.radios ?? raw.specializedControls?.radios?.length ?? 0,
          switches: raw.discoveredCounts?.specialized?.switches ?? raw.specializedControls?.switches?.length ?? 0,
          sliders: raw.discoveredCounts?.specialized?.sliders ?? raw.specializedControls?.sliders?.length ?? 0,
          tabs: raw.discoveredCounts?.specialized?.tabs ?? raw.specializedControls?.tabs?.length ?? 0,
          options: raw.discoveredCounts?.specialized?.options ?? raw.specializedControls?.options?.length ?? 0,
          menuItems: raw.discoveredCounts?.specialized?.menuItems ?? raw.specializedControls?.menuItems?.length ?? 0,
          fileInputs: raw.discoveredCounts?.specialized?.fileInputs ?? raw.specializedControls?.fileInputs?.length ?? 0,
          dateInputs: raw.discoveredCounts?.specialized?.dateInputs ?? raw.specializedControls?.dateInputs?.length ?? 0,
        }
      : emptySpecializedCoverageCounts(),
  };
  const omittedByGroup = {
    buttons: Math.max(0, discoveredByGroup.buttons - retainedByGroup.buttons),
    links: Math.max(0, discoveredByGroup.links - retainedByGroup.links),
    inputs: Math.max(0, discoveredByGroup.inputs - retainedByGroup.inputs),
    selects: Math.max(0, discoveredByGroup.selects - retainedByGroup.selects),
    textareas: Math.max(0, discoveredByGroup.textareas - retainedByGroup.textareas),
    checkboxes: Math.max(0, discoveredByGroup.checkboxes - retainedByGroup.checkboxes),
    specialized: {
      radios: Math.max(0, discoveredByGroup.specialized.radios - retainedByGroup.specialized.radios),
      switches: Math.max(0, discoveredByGroup.specialized.switches - retainedByGroup.specialized.switches),
      sliders: Math.max(0, discoveredByGroup.specialized.sliders - retainedByGroup.specialized.sliders),
      tabs: Math.max(0, discoveredByGroup.specialized.tabs - retainedByGroup.specialized.tabs),
      options: Math.max(0, discoveredByGroup.specialized.options - retainedByGroup.specialized.options),
      menuItems: Math.max(0, discoveredByGroup.specialized.menuItems - retainedByGroup.specialized.menuItems),
      fileInputs: Math.max(0, discoveredByGroup.specialized.fileInputs - retainedByGroup.specialized.fileInputs),
      dateInputs: Math.max(0, discoveredByGroup.specialized.dateInputs - retainedByGroup.specialized.dateInputs),
    },
  };

  return {
    discoveredByGroup,
    retainedByGroup,
    omittedByGroup,
    budget: {
      maxInteractives: settings.maxInteractives,
      maxButtons: collectionSettings.maxButtons,
      maxInputs: collectionSettings.maxInputs,
      maxSpecializedPerGroup: settings.maxSpecializedPerGroup,
    },
  };
}

export function sumCoverageGroupCounts(groups = {}) {
  return Object.entries(groups).reduce((total, [key, value]) => {
    if (key === 'specialized') {
      return total + sumCoverageGroupCounts(value);
    }
    return total + (Number(value) || 0);
  }, 0);
}
