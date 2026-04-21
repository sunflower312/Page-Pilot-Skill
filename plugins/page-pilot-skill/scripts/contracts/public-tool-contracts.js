export const PUBLIC_TOOL_CONTRACTS = [
  {
    id: 'browser_open',
    docFile: 'browser-open.md',
    contractHeading: 'browser_open',
    category: 'session',
  },
  {
    id: 'browser_scan',
    docFile: 'browser-scan.md',
    contractHeading: 'browser_scan',
    category: 'analysis',
  },
  {
    id: 'browser_rank_locators',
    docFile: 'browser-rank-locators.md',
    contractHeading: 'browser_rank_locators',
    category: 'analysis',
  },
  {
    id: 'browser_probe',
    docFile: 'browser-probe.md',
    contractHeading: 'browser_probe',
    category: 'analysis',
  },
  {
    id: 'browser_validate_playwright',
    docFile: 'browser-validate-playwright.md',
    contractHeading: 'browser_validate_playwright',
    category: 'playwright',
  },
  {
    id: 'browser_generate_playwright',
    docFile: 'browser-generate-playwright.md',
    contractHeading: 'browser_generate_playwright',
    category: 'playwright',
  },
  {
    id: 'browser_repair_playwright',
    docFile: 'browser-repair-playwright.md',
    contractHeading: 'browser_repair_playwright',
    category: 'playwright',
  },
  {
    id: 'browser_capture_screenshot',
    docFile: 'browser-capture-screenshot.md',
    contractHeading: 'browser_capture_screenshot',
    category: 'evidence',
  },
  {
    id: 'browser_snapshot_dom',
    docFile: 'browser-snapshot-dom.md',
    contractHeading: 'browser_snapshot_dom',
    category: 'evidence',
  },
  {
    id: 'browser_close',
    docFile: 'browser-close.md',
    contractHeading: 'browser_close',
    category: 'session',
  },
];

export const PUBLIC_TOOL_IDS = PUBLIC_TOOL_CONTRACTS.map((entry) => entry.id);
export const PUBLIC_TOOL_DOC_FILES = PUBLIC_TOOL_CONTRACTS.map((entry) => entry.docFile);
