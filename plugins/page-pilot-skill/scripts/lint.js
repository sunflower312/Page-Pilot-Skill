import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const ROOT = process.cwd();
const TARGET_DIRS = ['scripts', 'benchmarks/lib', 'tests'];

async function collectJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function runNodeCheck(files) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', ...files], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const files = [];
  for (const target of TARGET_DIRS) {
    files.push(...(await collectJsFiles(join(ROOT, target))));
  }

  const uniqueFiles = [...new Set(files)].sort();
  process.stdout.write(`Linting ${uniqueFiles.length} JavaScript files with node --check\n`);
  const exitCode = await runNodeCheck(uniqueFiles.map((file) => relative(ROOT, file)));
  process.exitCode = exitCode;
}

await main();
