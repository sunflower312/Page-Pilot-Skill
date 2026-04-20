import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ArtifactManager } from './lib/artifact-manager.js';
import { BrowserManager } from './lib/browser-manager.js';
import { registerAnalysisTools } from './tools/analysis-tools.js';
import { registerEvidenceTools } from './tools/evidence-tools.js';
import { registerPlaywrightTools } from './tools/playwright-tools.js';
import { registerSessionTools } from './tools/session-tools.js';

export function createPagePilotServer({
  artifactRoot = fileURLToPath(new URL('../../../artifacts/page-pilot-skill', import.meta.url)),
  idleMs = 300000,
} = {}) {
  const browserManager = new BrowserManager({ artifactRoot, idleMs });
  const artifactManager = new ArtifactManager(artifactRoot);
  const server = new McpServer({
    name: 'page-pilot-skill',
    version: '0.1.0',
  });

  registerSessionTools(server, { browserManager });
  registerAnalysisTools(server, { browserManager });
  registerPlaywrightTools(server, { browserManager, artifactManager });
  registerEvidenceTools(server, { browserManager, artifactManager });

  return {
    server,
    browserManager,
    artifactManager,
    artifactRoot,
  };
}
