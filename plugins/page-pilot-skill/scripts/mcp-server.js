import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPagePilotServer } from './server.js';

const { server, browserManager } = createPagePilotServer();

const transport = new StdioServerTransport();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void browserManager.closeAll().finally(() => process.exit(0));
  });
}

await server.connect(transport);
