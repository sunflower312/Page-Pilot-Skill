import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const defaultPluginRoot = fileURLToPath(new URL('../..', import.meta.url));

function unwrapToolResult(result) {
  if (result?.structuredContent !== undefined) {
    return result.structuredContent;
  }

  const text = result?.content?.find((entry) => entry.type === 'text')?.text;
  if (!text) {
    return result;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, rawText: text };
  }
}

export class BenchmarkClient {
  constructor(options = {}) {
    this.command = options.command ?? 'node';
    this.args = options.args ?? ['scripts/mcp-server.js'];
    this.cwd = options.cwd ?? defaultPluginRoot;
    this.clientName = options.clientName ?? 'page-pilot-skill-benchmarks';
    this.clientVersion = options.clientVersion ?? '0.1.0';
    this.transport = null;
    this.client = null;
  }

  async connect() {
    if (this.client) {
      return this;
    }

    this.transport = new StdioClientTransport({
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      stderr: 'pipe',
    });
    this.client = new Client(
      { name: this.clientName, version: this.clientVersion },
      { capabilities: {} }
    );
    await this.client.connect(this.transport);
    return this;
  }

  async listTools() {
    const result = await this.client.listTools();
    return result.tools ?? [];
  }

  async callTool(name, args = {}) {
    const result = await this.client.callTool({
      name,
      arguments: args,
    });
    return unwrapToolResult(result);
  }

  async openSession(args = {}) {
    return this.callTool('browser_open', args);
  }

  async closeSession(sessionId) {
    return this.callTool('browser_close', { sessionId });
  }

  async close() {
    if (!this.client) {
      return;
    }

    await this.client.close();
    this.client = null;
    this.transport = null;
  }
}

export function createBenchmarkClient(options = {}) {
  return new BenchmarkClient(options);
}
