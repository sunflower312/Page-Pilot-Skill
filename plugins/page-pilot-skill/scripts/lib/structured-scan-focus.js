export function normalizeScanFocus(focus = {}) {
  return {
    kind: focus?.kind ?? 'generic',
    targetText: focus?.targetText ?? undefined,
  };
}

export function createScanFocusSummary(focus = {}) {
  const normalized = normalizeScanFocus(focus);
  return {
    ...normalized,
    applied: true,
  };
}
