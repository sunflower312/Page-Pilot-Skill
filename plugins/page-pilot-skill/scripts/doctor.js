import { access } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

function parseArgs(argv = []) {
  return {
    requireBrowser: argv.includes('--require-browser'),
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const browserInstalled = await hasChromiumExecutable();
  const checks = {
    nodeVersion: process.versions.node,
    nodeSupported: Number.isFinite(nodeMajor) && nodeMajor >= 20,
    chromiumInstalled: browserInstalled,
  };

  log(`Node.js: ${checks.nodeVersion}`, options);
  log(`Chromium installed: ${checks.chromiumInstalled ? 'yes' : 'no'}`, options);

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

  log('Doctor check passed.', options);
}

await main();
