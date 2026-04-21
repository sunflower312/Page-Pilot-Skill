export function pickByLimit(entries = [], limit) {
  return entries.slice(0, Number.isFinite(limit) ? limit : entries.length);
}

export function buildCollections(raw = {}, settings = {}) {
  const tables = pickByLimit(raw.tables ?? [], settings.maxLists).map((table) => ({
    label: table.label || table.css || 'table',
    headers: table.headers ?? [],
    rowCountEstimate: table.rowCountEstimate ?? null,
    rowActions: table.rowActions ?? [],
    locator: {
      strategy: 'css',
      value: table.css,
    },
  }));
  const lists = pickByLimit(raw.lists ?? [], settings.maxLists).map((list) => ({
    label: list.label || list.css || 'list',
    itemsCount: list.itemsCount ?? 0,
    sampleItems: list.itemsPreview ?? [],
    locator: {
      strategy: 'css',
      value: list.css,
    },
  }));
  const resultRegions = [
    ...tables
      .filter((table) => (table.rowCountEstimate ?? 0) > 0)
      .map((table) => ({ kind: 'table', label: table.label, itemsCount: table.rowCountEstimate ?? 0 })),
    ...lists
      .filter((list) => (list.itemsCount ?? 0) > 0)
      .map((list) => ({ kind: 'list', label: list.label, itemsCount: list.itemsCount ?? 0 })),
  ].slice(0, settings.maxLists);

  return {
    tables,
    lists,
    cards: [],
    resultRegions,
  };
}
