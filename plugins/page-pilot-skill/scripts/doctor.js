import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

function parseArgs(argv = []) {
  return {
    requireBrowser: argv.includes('--require-browser'),
    requireCodex: argv.includes('--require-codex'),
    quiet: argv.includes('--quiet'),
  };
}

function log(message, { quiet } = {}) {
  if (!quiet) {
    process.stdout.write(`${message}\n`);
  }
}

async function hasChromiumExecutable() {
  try {
    await access(chromium.executablePath());
    return true;
  } catch {
    return false;
  }
}

function checkCodexCli() {
  const result = spawnSync('codex', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    available: result.status === 0,
    error: result.error?.message ?? result.stderr?.trim() ?? '',
  };
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const browserInstalled = await hasChromiumExecutable();
  const scriptDir = fileURLToPath(new URL('.', import.meta.url));
  const serverPath = resolve(scriptDir, 'mcp-server.js');
  const pluginManifestPath = resolve(scriptDir, '..', '.codex-plugin', 'plugin.json');
  const installScriptPath = resolve(scriptDir, 'install-codex-mcp.js');
  const codex = checkCodexCli();
  const checks = {
    nodeVersion: process.versions.node,
    nodeSupported: Number.isFinite(nodeMajor) && nodeMajor >= 20,
    chromiumInstalled: browserInstalled,
    codexCliAvailable: codex.available,
    mcpServerPresent: await pathExists(serverPath),
    pluginManifestPresent: await pathExists(pluginManifestPath),
    installScriptPresent: await pathExists(installScriptPath),
  };

  log(`Node.js: ${checks.nodeVersion}`, options);
  log(`Chromium installed: ${checks.chromiumInstalled ? 'yes' : 'no'}`, options);
  log(`Codex CLI available: ${checks.codexCliAvailable ? 'yes' : 'no'}`, options);
  log(`MCP server entry present: ${checks.mcpServerPresent ? 'yes' : 'no'}`, options);
  log(`Plugin manifest present: ${checks.pluginManifestPresent ? 'yes' : 'no'}`, options);
  log(`Install script present: ${checks.installScriptPresent ? 'yes' : 'no'}`, options);

  if (!checks.nodeSupported) {
    process.stderr.write('Node.js 20 or newer is required.\n');
    process.exitCode = 1;
    return;
  }

  if (options.requireBrowser && !checks.chromiumInstalled) {
    process.stderr.write('Playwright Chromium is not installed. Run `npm run install:chromium`.\n');
    process.exitCode = 1;
    return;
  }

  if (!checks.mcpServerPresent) {
    process.stderr.write('Missing MCP server entry script at scripts/mcp-server.js.\n');
    process.exitCode = 1;
    return;
  }

  if (!checks.pluginManifestPresent) {
    process.stderr.write('Missing plugin manifest at plugins/page-pilot-skill/.codex-plugin/plugin.json.\n');
    process.exitCode = 1;
    return;
  }

  if (!checks.installScriptPresent) {
    process.stderr.write('Missing install script at plugins/page-pilot-skill/scripts/install-codex-mcp.js.\n');
    process.exitCode = 1;
    return;
  }

  if (options.requireCodex && !checks.codexCliAvailable) {
    process.stderr.write(
      `Codex CLI is not available. Install or expose \`codex\` on PATH before running the installer. ${codex.error ? `(${codex.error})` : ''}\n`
    );
    process.exitCode = 1;
    return;
  }

  log('Doctor check passed.', options);
}

await main();
