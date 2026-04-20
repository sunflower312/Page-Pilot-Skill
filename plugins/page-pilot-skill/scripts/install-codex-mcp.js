import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('./mcp-server.js', import.meta.url));

const availability = spawnSync('codex', ['--version'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (availability.error || availability.status !== 0) {
  process.stderr.write(
    `Codex CLI is not available. Install Codex and ensure \`codex\` is on PATH before running this installer. ${
      availability.error?.message ?? availability.stderr?.trim() ?? ''
    }\n`
  );
  process.exit(1);
}

const addArgs = ['mcp', 'add', 'page-pilot-skill', '--', 'node', serverPath];
const firstAdd = spawnSync('codex', addArgs, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (firstAdd.status === 0) {
  process.exit(0);
}

const firstAddMessage = `${firstAdd.error?.message ?? ''}\n${firstAdd.stderr ?? ''}`.trim();
const alreadyExists = /already exists|already registered|duplicate/i.test(firstAddMessage);

if (!alreadyExists) {
  process.stdout.write(firstAdd.stdout ?? '');
  process.stderr.write(firstAdd.stderr ?? '');
  process.exit(firstAdd.status ?? 1);
}
process.stdout.write('Page Pilot Skill MCP 已经存在，当前安装保持非破坏性 no-op。\n');
process.stdout.write('如果你需要刷新注册，请先手动执行 `codex mcp remove page-pilot-skill`，再重新运行 `npm run install:codex`。\n');
process.exit(0);
