import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createPagePilotServer } from '../../scripts/server.js';

const unitDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(unitDir, '..', '..');
const repoRoot = resolve(pluginRoot, '..', '..');

const PUBLIC_TOOLS = [
  'browser_open',
  'browser_scan',
  'browser_rank_locators',
  'browser_probe',
  'browser_validate_playwright',
  'browser_generate_playwright',
  'browser_repair_playwright',
  'browser_capture_screenshot',
  'browser_snapshot_dom',
  'browser_close',
];

test('public MCP tool surface matches the documented tool contract set', async () => {
  const { server, browserManager } = createPagePilotServer();

  try {
    const toolNames = Object.keys(server._registeredTools ?? {}).sort();
    assert.deepEqual(toolNames, [...PUBLIC_TOOLS].sort());
  } finally {
    await browserManager.closeAll();
  }
});

test('contracts and skill docs mention every public tool and no extra public tool names', async () => {
  const contractsPath = resolve(repoRoot, 'docs', 'contracts.md');
  const skillPath = resolve(pluginRoot, 'skills', 'page-pilot-skill', 'SKILL.md');
  const [contracts, skill] = await Promise.all([readFile(contractsPath, 'utf8'), readFile(skillPath, 'utf8')]);

  for (const toolName of PUBLIC_TOOLS) {
    assert.equal(contracts.includes(`### \`${toolName}\``), true, `${toolName} missing from docs/contracts.md`);
    assert.match(skill, new RegExp(`\\b${toolName}\\b`), `${toolName} missing from SKILL.md`);
  }

  const publicContractHeadings = [...contracts.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]);
  assert.deepEqual(publicContractHeadings, PUBLIC_TOOLS);
});

test('docs/tools contains a detailed contract page for every public tool', async () => {
  const expectedDocs = [
    'browser-open.md',
    'browser-scan.md',
    'browser-rank-locators.md',
    'browser-probe.md',
    'browser-validate-playwright.md',
    'browser-generate-playwright.md',
    'browser-repair-playwright.md',
    'browser-capture-screenshot.md',
    'browser-snapshot-dom.md',
    'browser-close.md',
  ];

  for (const docName of expectedDocs) {
    const fullPath = resolve(repoRoot, 'docs', 'tools', docName);
    const content = await readFile(fullPath, 'utf8');
    assert.equal(content.length > 0, true, `${docName} should not be empty`);
  }
});
