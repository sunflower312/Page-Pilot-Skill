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

function extractJsonBlocks(markdown) {
  return [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

test('public MCP tool surface matches the documented tool contract set', async () => {
  const { server, browserManager } = createPagePilotServer();

  try {
    const toolNames = Object.keys(server._registeredTools ?? {})
      .filter((toolName) => !toolName.endsWith('_internal'))
      .sort();
    assert.deepEqual(toolNames, [...PUBLIC_TOOLS].sort());
  } finally {
    await browserManager.closeAll();
  }
});

test('public MCP tool surface ignores gated internal tools when internal probe mode is enabled', async () => {
  const previous = process.env.PAGE_PILOT_INTERNAL_PROBE;
  process.env.PAGE_PILOT_INTERNAL_PROBE = '1';
  const { server, browserManager } = createPagePilotServer();

  try {
    const registeredTools = Object.keys(server._registeredTools ?? {});
    assert.equal(registeredTools.includes('browser_probe_script_internal'), true);
    const publicToolNames = registeredTools.filter((toolName) => !toolName.endsWith('_internal')).sort();
    assert.deepEqual(publicToolNames, [...PUBLIC_TOOLS].sort());
  } finally {
    if (previous === undefined) {
      delete process.env.PAGE_PILOT_INTERNAL_PROBE;
    } else {
      process.env.PAGE_PILOT_INTERNAL_PROBE = previous;
    }
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

test('browser_scan and browser_rank_locators contract examples are valid JSON and match key public fields', async () => {
  const [scanDoc, rankDoc, contractsDoc] = await Promise.all([
    readFile(resolve(repoRoot, 'docs', 'tools', 'browser-scan.md'), 'utf8'),
    readFile(resolve(repoRoot, 'docs', 'tools', 'browser-rank-locators.md'), 'utf8'),
    readFile(resolve(repoRoot, 'docs', 'contracts.md'), 'utf8'),
  ]);

  for (const block of [...extractJsonBlocks(scanDoc), ...extractJsonBlocks(rankDoc), ...extractJsonBlocks(contractsDoc)]) {
    assert.doesNotThrow(() => JSON.parse(block), 'contract JSON example should be valid JSON');
  }

  const scanOutput = JSON.parse(extractJsonBlocks(scanDoc)[1]);
  assert.equal(scanOutput.ok, true);
  assert.equal(scanOutput.schemaVersion, 'scan.v3');
  assert.equal(scanOutput.focus.kind, 'form_fill');
  assert.equal(scanOutput.summary.coverage.discoveredByGroup.specialized.radios, 1);
  assert.equal(Array.isArray(scanOutput.interactives.inputs[0].recommendedLocators), true);
  assert.equal(scanOutput.interactives.inputs[0].recommendedLocators[0].locator.strategy, 'role');
  assert.equal(scanOutput.interactives.inputs[0].recommendedLocators[0].stabilityReason, 'semantic_role_name');
  assert.equal(scanOutput.interactives.inputs[0].recommendedLocators[0].verification.attempted, true);
  assert.equal(Array.isArray(scanOutput.specializedControls.radios), true);
  assert.equal(Array.isArray(scanOutput.collections.resultRegions), true);

  const rankOutput = JSON.parse(extractJsonBlocks(rankDoc)[1]);
  assert.equal(rankOutput.ok, true);
  assert.equal(Array.isArray(rankOutput.matches), true);
  assert.equal(rankOutput.matches[0].stabilityReason, 'semantic_role_name');
  assert.equal(rankOutput.matches[0].locatorChoices[0].locator.strategy, 'role');
});
