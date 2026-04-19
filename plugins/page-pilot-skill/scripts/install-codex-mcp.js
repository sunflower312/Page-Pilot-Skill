import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('./mcp-server.js', import.meta.url));

spawnSync('codex', ['mcp', 'remove', 'page-pilot-skill'], {
  stdio: 'ignore',
});

const result = spawnSync('codex', ['mcp', 'add', 'page-pilot-skill', '--', 'node', serverPath], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
