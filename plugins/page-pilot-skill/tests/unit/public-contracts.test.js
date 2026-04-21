import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { PUBLIC_TOOL_CONTRACTS, PUBLIC_TOOL_DOC_FILES, PUBLIC_TOOL_IDS } from '../../scripts/contracts/public-tool-contracts.js';
import { createPagePilotServer } from '../../scripts/server.js';

const unitDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(unitDir, '..', '..');
const repoRoot = resolve(pluginRoot, '..', '..');

function extractJsonBlocks(markdown) {
  return [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

function findJsonExample(blocks, predicate, message) {
  const parsedBlocks = blocks.map((block) => JSON.parse(block));
  const match = parsedBlocks.find(predicate);
  assert.ok(match, message);
  return match;
}

test('public tool contract registry is internally consistent', () => {
  assert.equal(new Set(PUBLIC_TOOL_IDS).size, PUBLIC_TOOL_IDS.length, 'tool ids must be unique');
  assert.equal(new Set(PUBLIC_TOOL_DOC_FILES).size, PUBLIC_TOOL_DOC_FILES.length, 'tool doc files must be unique');
  assert.equal(
    new Set(PUBLIC_TOOL_CONTRACTS.map((entry) => entry.contractHeading)).size,
    PUBLIC_TOOL_CONTRACTS.length,
    'contract headings must be unique'
  );
});

test('public MCP tool surface matches the documented tool contract set', async () => {
  const { server, browserManager } = createPagePilotServer();

  try {
    const toolNames = Object.keys(server._registeredTools ?? {})
      .filter((toolName) => !toolName.endsWith('_internal'))
      .sort();
    assert.deepEqual(toolNames, [...PUBLIC_TOOL_IDS].sort());
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
    assert.deepEqual(publicToolNames, [...PUBLIC_TOOL_IDS].sort());
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

  for (const toolName of PUBLIC_TOOL_IDS) {
    assert.equal(contracts.includes(`### \`${toolName}\``), true, `${toolName} missing from docs/contracts.md`);
    assert.match(skill, new RegExp(`\\b${toolName}\\b`), `${toolName} missing from SKILL.md`);
  }

  const publicContractHeadings = [...contracts.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]);
  assert.deepEqual(publicContractHeadings, PUBLIC_TOOL_CONTRACTS.map((entry) => entry.contractHeading));
});

test('docs/tools contains a detailed contract page for every public tool', async () => {
  for (const docName of PUBLIC_TOOL_DOC_FILES) {
    const fullPath = resolve(repoRoot, 'docs', 'tools', docName);
    const content = await readFile(fullPath, 'utf8');
    assert.equal(content.length > 0, true, `${docName} should not be empty`);
  }
});

test('every public tool doc JSON example is syntactically valid', async () => {
  for (const docName of PUBLIC_TOOL_DOC_FILES) {
    const fullPath = resolve(repoRoot, 'docs', 'tools', docName);
    const content = await readFile(fullPath, 'utf8');
    for (const block of extractJsonBlocks(content)) {
      assert.doesNotThrow(() => JSON.parse(block), `${docName} should contain valid JSON examples`);
    }
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

  const scanBlocks = extractJsonBlocks(scanDoc);
  const rankBlocks = extractJsonBlocks(rankDoc);
  const contractBlocks = extractJsonBlocks(contractsDoc);

  const scanOutput = findJsonExample(
    scanBlocks,
    (example) => example.schemaVersion === 'scan.v3',
    'browser-scan.md should contain a scan.v3 output example'
  );
  assert.equal(scanOutput.ok, true);
  assert.equal(scanOutput.schemaVersion, 'scan.v3');
  assert.equal(scanOutput.focus.kind, 'form_fill');
  assert.equal(scanOutput.summary.coverage.discoveredByGroup.specialized.radios, 1);
  assert.equal(Array.isArray(scanOutput.interactives.inputs[0].recommendedLocators), true);
  assert.equal(scanOutput.interactives.inputs[0].recommendedLocators[0].locator.strategy, 'role');
  assert.equal(Number.isInteger(scanOutput.interactives.inputs[0].recommendedLocators[0].score), true);
  assert.equal(scanOutput.interactives.inputs[0].recommendedLocators[0].stabilityReason, 'semantic_role_name');
  assert.equal(scanOutput.interactives.inputs[0].recommendedLocators[0].verification.attempted, true);
  assert.equal(Array.isArray(scanOutput.specializedControls.radios), true);
  assert.equal(Array.isArray(scanOutput.collections.resultRegions), true);

  const rankOutput = findJsonExample(
    rankBlocks,
    (example) => Array.isArray(example.matches),
    'browser-rank-locators.md should contain a ranked locator output example'
  );
  assert.equal(rankOutput.ok, true);
  assert.equal(Array.isArray(rankOutput.matches), true);
  assert.equal(rankOutput.matches[0].stabilityReason, 'semantic_role_name');
  assert.equal(rankOutput.matches[0].confidence.level, 'high');
  assert.equal(Array.isArray(rankOutput.matches[0].confidence.reasons), true);
  assert.equal(rankOutput.matches[0].locatorChoices[0].locator.strategy, 'role');
  assert.equal(Object.hasOwn(rankOutput.matches[0].locatorChoices[0], 'locator'), true);

  const contractsScanOutput = findJsonExample(
    contractBlocks,
    (example) => example.schemaVersion === 'scan.v3',
    'docs/contracts.md should contain a scan.v3 output example'
  );
  assert.equal(contractsScanOutput.detailLevel, 'standard');
  assert.equal(contractsScanOutput.document.readyState, 'complete');
  assert.equal(contractsScanOutput.document.detailLevel, 'standard');
  assert.equal(Array.isArray(contractsScanOutput.document.regions.forms), true);
  assert.equal(contractsScanOutput.hints.primaryAction.locator.strategy, 'role');
  assert.equal(Number.isInteger(contractsScanOutput.interactives.buttons[0].recommendedLocators[0].score), true);
  assert.equal(contractsScanOutput.interactives.buttons[0].recommendedLocators[0].stabilityReason, 'semantic_role_name');

  const contractsRankOutput = findJsonExample(
    contractBlocks,
    (example) => Array.isArray(example.matches),
    'docs/contracts.md should contain a browser_rank_locators output example'
  );
  assert.equal(contractsRankOutput.query.role, 'button');
  assert.equal(contractsRankOutput.matchCount, 1);
  assert.equal(contractsRankOutput.matches[0].rank, 1);
  assert.equal(typeof contractsRankOutput.matches[0].score, 'number');
  assert.equal(Array.isArray(contractsRankOutput.matches[0].reasons), true);
  assert.equal(contractsRankOutput.matches[0].preferredLocator.strategy, 'role');
  assert.equal(Array.isArray(contractsRankOutput.matches[0].fallbackLocators), true);
  assert.equal(contractsRankOutput.matches[0].stableFingerprint.role, 'button');
  assert.equal(contractsRankOutput.matches[0].confidence.level, 'high');
  assert.equal(Array.isArray(contractsRankOutput.matches[0].confidence.reasons), true);
  assert.equal(Object.hasOwn(contractsRankOutput.matches[0].locatorChoices[0], 'locator'), true);
});

test('browser_generate_playwright and browser_repair_playwright contract examples expose source metadata', async () => {
  const [generateDoc, repairDoc, contractsDoc] = await Promise.all([
    readFile(resolve(repoRoot, 'docs', 'tools', 'browser-generate-playwright.md'), 'utf8'),
    readFile(resolve(repoRoot, 'docs', 'tools', 'browser-repair-playwright.md'), 'utf8'),
    readFile(resolve(repoRoot, 'docs', 'contracts.md'), 'utf8'),
  ]);

  const generateExample = findJsonExample(
    extractJsonBlocks(generateDoc),
    (example) => example.framework === 'playwright-test' && example.source?.generatedFrom === 'validated_playwright_evidence',
    'browser-generate-playwright.md should document the source metadata'
  );
  assert.equal(generateExample.source.sessionId, 'session-123');
  assert.equal(typeof generateExample.source.actionCount, 'number');
  assert.equal(typeof generateExample.source.assertionCount, 'number');

  const repairExample = findJsonExample(
    extractJsonBlocks(repairDoc),
    (example) => example.repairedArtifacts?.source?.generatedFrom === 'repair_validation_evidence',
    'browser-repair-playwright.md should document repairedArtifacts.source'
  );
  assert.equal(repairExample.repairedArtifacts.source.sessionId, 'session-123');

  const contractsGenerateExample = findJsonExample(
    extractJsonBlocks(contractsDoc),
    (example) => example.framework === 'playwright-test' && example.source?.generatedFrom === 'validated_playwright_evidence',
    'docs/contracts.md should document browser_generate_playwright source metadata'
  );
  assert.equal(contractsGenerateExample.source.sessionId, 'session-123');

  const contractsRepairExample = findJsonExample(
    extractJsonBlocks(contractsDoc),
    (example) => example.repairedArtifacts?.source?.generatedFrom === 'repair_validation_evidence',
    'docs/contracts.md should document browser_repair_playwright source metadata'
  );
  assert.equal(contractsRepairExample.repairedArtifacts.source.sessionId, 'session-123');
});
