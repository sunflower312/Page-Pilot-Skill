import { z } from 'zod';

import {
  viewportSchema,
  waitUntilSchema,
} from '../schemas/tool-schemas.js';
import { createError, handleTool } from './tool-helpers.js';

export function registerSessionTools(server, { browserManager }) {
  server.registerTool(
    'browser_open',
    {
      description: 'Open a headless Playwright page and create a reusable session for analysis, validation, and code generation.',
      inputSchema: {
        url: z.string().url(),
        viewport: viewportSchema.optional(),
        storageStatePath: z.string().optional(),
        waitUntil: waitUntilSchema.default('load').optional(),
        timeoutMs: z.number().int().positive().default(15000).optional(),
      },
    },
    async ({ url, viewport, storageStatePath, waitUntil = 'load', timeoutMs = 15000 }) => {
      return handleTool(async () => {
        const session = await browserManager.openSession({ url, viewport, storageStatePath, waitUntil, timeoutMs });
        session.initialUrl = url;
        session.lastValidation = null;
        return { ok: true, sessionId: session.id, title: session.title, url: session.url };
      }, 'BROWSER_OPEN_FAILED');
    }
  );

  server.registerTool(
    'browser_close',
    {
      description: 'Close an active browser session.',
      inputSchema: {
        sessionId: z.string(),
      },
    },
    async ({ sessionId }) => {
      return handleTool(async () => {
        if (!browserManager.getSession(sessionId)) {
          throw createError('SESSION_NOT_FOUND', `Unknown session: ${sessionId}`, { sessionId });
        }
        const closed = await browserManager.closeSession(sessionId);
        if (!closed) {
          throw createError('SESSION_NOT_FOUND', `Unknown session: ${sessionId}`, { sessionId });
        }
        return { ok: closed };
      }, 'BROWSER_CLOSE_FAILED');
    }
  );
}
