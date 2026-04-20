import { z } from 'zod';

import { handleTool, withSessionOrThrow } from './tool-helpers.js';

export function registerEvidenceTools(server, { browserManager, artifactManager }) {
  server.registerTool(
    'browser_capture_screenshot',
    {
      description: 'Capture a screenshot for the current session.',
      inputSchema: {
        sessionId: z.string(),
        fullPage: z.boolean().default(true).optional(),
      },
    },
    async ({ sessionId, fullPage = true }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
          const path = await artifactManager.nextPath(sessionId, 'screenshot', 'png');
          await session.page.screenshot({ path, fullPage });
          return { ok: true, path };
        });
      }, 'BROWSER_CAPTURE_SCREENSHOT_FAILED');
    }
  );

  server.registerTool(
    'browser_snapshot_dom',
    {
      description: 'Write the current page DOM to disk.',
      inputSchema: {
        sessionId: z.string(),
      },
    },
    async ({ sessionId }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
          const path = await artifactManager.writeText(sessionId, 'dom', 'html', await session.page.content());
          return { ok: true, path };
        });
      }, 'BROWSER_SNAPSHOT_DOM_FAILED');
    }
  );
}
