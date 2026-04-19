import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { runActions } from './lib/action-runner.js';
import { ArtifactManager } from './lib/artifact-manager.js';
import { BrowserManager } from './lib/browser-manager.js';
import { buildObservation, captureObservationSnapshot, hasMainDocumentTransition } from './lib/observation.js';
import { generatePlaywrightTest } from './lib/playwright-generator.js';
import { executeScript, isNavigationInterruptionError } from './lib/script-execution.js';
import { exploreGoal } from './lib/goal-orchestrator.js';
import { openHydratedSession } from './lib/session-bootstrap.js';
import { executeSessionActions } from './lib/session-action-execution.js';
import { SiteIntelligenceStore } from './lib/site-intelligence-store.js';
import { buildStrategyReport } from './lib/strategy-report.js';
import { collectStructuredPageData } from './lib/structured-scan.js';
import { buildSiteProfile, recordFailureRun, recordSuccessfulRun } from './lib/workflow-intelligence.js';

const artifactRoot = fileURLToPath(new URL('../../../artifacts/page-pilot-skill', import.meta.url));
const browserManager = new BrowserManager({ artifactRoot, idleMs: 300000 });
const artifactManager = new ArtifactManager(artifactRoot);
const siteIntelligenceStore = new SiteIntelligenceStore({
  rootDir: fileURLToPath(new URL('../../../artifacts/page-pilot-skill/site-intelligence', import.meta.url)),
});
const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
const waitUntilSchema = z.enum(['commit', 'domcontentloaded', 'load', 'networkidle']);
const pageTypeSchema = z.enum(['dialog', 'auth', 'form', 'learning', 'listing', 'detail', 'content', 'unknown']);
const roleLocatorSchema = z.object({
  strategy: z.literal('role'),
  value: z.object({
    role: z.string().min(1),
    name: z.string().min(1),
  }),
});
const stringLocatorStrategies = ['label', 'text', 'placeholder', 'testId', 'css'];
const stringLocatorSchemas = stringLocatorStrategies.map((strategy) =>
  z.object({
    strategy: z.literal(strategy),
    value: z.string().min(1),
  })
);
const locatorSchema = z.union([roleLocatorSchema, ...stringLocatorSchemas]);
const actionStabilitySchema = z
  .object({
    after: z.enum(['auto', 'none']).default('auto').optional(),
    timeoutMs: z.number().int().positive().optional(),
    settleMs: z.number().int().positive().optional(),
    minObserveMs: z.number().int().positive().optional(),
  })
  .optional();
const inputHintValueSchema = z.union([z.string(), z.array(z.string()), z.boolean()]);
const successIndicatorsSchema = z
  .object({
    textIncludes: z.array(z.string().min(1)).optional(),
    urlIncludes: z.array(z.string().min(1)).optional(),
    pageTypes: z.array(pageTypeSchema).optional(),
  })
  .optional();
const locatableActionFields = {
  locator: locatorSchema,
  fallbackLocators: z.array(locatorSchema).optional(),
  stability: actionStabilitySchema,
};
const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    url: z.string().min(1),
    waitUntil: waitUntilSchema.optional(),
    stability: actionStabilitySchema,
  }),
  z.object({
    type: z.literal('click'),
    ...locatableActionFields,
  }),
  z.object({
    type: z.literal('fill'),
    ...locatableActionFields,
    value: z.string(),
  }),
  z.object({
    type: z.literal('press'),
    ...locatableActionFields,
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal('select'),
    ...locatableActionFields,
    value: z.union([z.string(), z.array(z.string())]),
  }),
  z.object({
    type: z.literal('check'),
    ...locatableActionFields,
    checked: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('capture'),
    ...locatableActionFields,
  }),
  z.object({
    type: z.literal('wait_for'),
    value: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('assert_text'),
    ...locatableActionFields,
    value: z.string(),
  }),
  z.object({
    type: z.literal('assert_url'),
    value: z.string().min(1),
  }),
]);

function formatResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function createError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function formatError(error, fallbackCode = 'INTERNAL_ERROR') {
  return formatResult({
    ok: false,
    error: {
      code: error?.code ?? fallbackCode,
      message: error?.message ?? 'Unknown error',
      details: error?.details,
    },
  });
}

async function withSessionOrThrow(sessionId, callback) {
  const session = browserManager.beginSessionActivity(sessionId);
  if (!session) {
    throw createError('SESSION_NOT_FOUND', `Unknown session: ${sessionId}`, { sessionId });
  }

  try {
    return await callback(session);
  } finally {
    browserManager.endSessionActivity(sessionId);
  }
}

function persistSuccessfulSessionRun(session, execution, actions, goal = '') {
  session.lastSuccessfulRun = {
    initialUrl: execution.before.url,
    finalUrl: execution.result.finalUrl,
    steps: execution.result.steps,
  };
  recordSuccessfulRun(session, {
    goal,
    stateModel: execution.strategyState,
    initialUrl: execution.before.url,
    finalUrl: execution.result.finalUrl,
    steps: execution.result.steps,
  });
  return actions;
}

async function persistSiteKnowledge(session) {
  await siteIntelligenceStore.persistSession(session);
}

async function handleTool(callback, fallbackCode) {
  try {
    return formatResult(await callback());
  } catch (error) {
    return formatError(error, fallbackCode);
  }
}

const server = new McpServer({
  name: 'page-pilot-skill',
  version: '0.1.0',
});

server.registerTool(
  'browser_open',
  {
    description: 'Open a headless Playwright page and create a reusable session.',
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
      const session = await openHydratedSession({
        browserManager,
        siteIntelligenceStore,
        openOptions: { url, viewport, storageStatePath, waitUntil, timeoutMs },
      });
      return { ok: true, sessionId: session.id, title: session.title, url: session.url };
    }, 'BROWSER_OPEN_FAILED');
  }
);

server.registerTool(
  'browser_scan',
  {
    description: 'Collect a structured summary of the current page.',
    inputSchema: {
      sessionId: z.string(),
      detailLevel: z.enum(['brief', 'standard', 'full']).default('standard').optional(),
    },
  },
  async ({ sessionId, detailLevel = 'standard' }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        return await collectStructuredPageData(session.page, { detailLevel });
      });
    }, 'BROWSER_SCAN_FAILED');
  }
);

server.registerTool(
  'browser_execute_js',
  {
    description: 'Execute JavaScript inside the active page.',
    inputSchema: {
      sessionId: z.string(),
      script: z.string(),
    },
  },
  async ({ sessionId, script }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const before = await captureObservationSnapshot(session.page);
        try {
          const data = await executeScript(session.page, script);
          const after = await captureObservationSnapshot(session.page);
          return { ok: true, data, observation: buildObservation(before, after) };
        } catch (error) {
          if (!isNavigationInterruptionError(error)) {
            throw error;
          }

          let after;
          try {
            after = await captureObservationSnapshot(session.page);
          } catch {
            throw error.cause ?? error;
          }

          const observation = buildObservation(before, after);
          if (!hasMainDocumentTransition(before, after)) {
            throw error.cause ?? error;
          }

          return { ok: true, data: null, observation };
        }
      });
    }, 'BROWSER_EXECUTE_JS_FAILED');
  }
);

server.registerTool(
  'browser_strategy_report',
  {
    description:
      'Build a strategy snapshot for the current page, including state modeling, task decomposition, recovery hints, learned site experience, and workflow summary.',
    inputSchema: {
      sessionId: z.string(),
      goal: z.string().optional(),
    },
  },
  async ({ sessionId, goal = '' }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const scan = await collectStructuredPageData(session.page, { detailLevel: 'standard' });
        return buildStrategyReport({ session, scan, goal });
      });
    }, 'BROWSER_STRATEGY_REPORT_FAILED');
  }
);

server.registerTool(
  'browser_site_profile',
  {
    description: 'Return the learned site profile and reusable workflow templates for the current session site.',
    inputSchema: {
      sessionId: z.string(),
    },
  },
  async ({ sessionId }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const scan = await collectStructuredPageData(session.page, { detailLevel: 'brief' });
        const report = buildStrategyReport({ session, scan, goal: '' });
        return {
          ok: true,
          ...buildSiteProfile(session, report.state),
        };
      });
    }, 'BROWSER_SITE_PROFILE_FAILED');
  }
);

server.registerTool(
  'browser_explore_goal',
  {
    description:
      'Run a bounded planner/executor loop for a goal, using current page state, optional field hints, and success indicators. Successful runs feed Playwright code generation.',
    inputSchema: {
      sessionId: z.string(),
      goal: z.string().min(1),
      inputHints: z.record(z.string(), inputHintValueSchema).optional(),
      successIndicators: successIndicatorsSchema,
      maxCycles: z.number().int().positive().max(12).default(6).optional(),
      maxActionsPerCycle: z.number().int().positive().max(6).default(4).optional(),
    },
  },
  async ({ sessionId, goal, inputHints = {}, successIndicators = {}, maxCycles = 6, maxActionsPerCycle = 4 }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const result = await exploreGoal({
          sessionId,
          session,
          goal,
          inputHints,
          successIndicators,
          maxCycles,
          maxActionsPerCycle,
          artifactManager,
        });
        await persistSiteKnowledge(session);
        return result;
      });
    }, 'BROWSER_EXPLORE_GOAL_FAILED');
  }
);

server.registerTool(
  'browser_run_actions',
  {
    description: 'Execute a sequence of browser actions in the current session.',
    inputSchema: {
      sessionId: z.string(),
      actions: z.array(actionSchema),
    },
  },
  async ({ sessionId, actions }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const execution = await executeSessionActions({
          sessionId,
          session,
          actions,
          artifactManager,
        });
        if (execution.result.ok) {
          persistSuccessfulSessionRun(session, execution, actions);
        } else {
          recordFailureRun(session, {
            error: execution.result.error,
            action: actions[execution.result.error?.stepIndex ?? 0] ?? null,
            stateModel: execution.strategyState,
          });
        }
        await persistSiteKnowledge(session);
        return { ...execution.result, observation: execution.observation };
      });
    }, 'BROWSER_RUN_ACTIONS_FAILED');
  }
);

server.registerTool(
  'browser_generate_playwright',
  {
    description: 'Generate Playwright TypeScript from the latest successful action flow.',
    inputSchema: {
      sessionId: z.string(),
      testName: z.string().default('generated flow').optional(),
      includeImports: z.boolean().default(true).optional(),
      includeTestWrapper: z.boolean().default(true).optional(),
    },
  },
  async ({ sessionId, testName = 'generated flow', includeImports = true, includeTestWrapper = true }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        if (!session.lastSuccessfulRun) {
          throw createError('NO_SUCCESSFUL_FLOW', `No successful action flow found for session: ${sessionId}`, { sessionId });
        }

        const generated = generatePlaywrightTest({
          testName,
          initialUrl: session.lastSuccessfulRun.initialUrl,
          steps: session.lastSuccessfulRun.steps,
          includeImports,
          includeTestWrapper,
        });

        return {
          ok: true,
          language: 'ts',
          framework: 'playwright-test',
          code: generated.code,
          warnings: generated.warnings,
          source: {
            sessionId,
            generatedFrom: 'last_successful_run',
            startUrl: session.lastSuccessfulRun.initialUrl,
            finalUrl: session.lastSuccessfulRun.finalUrl,
            actionCount: session.lastSuccessfulRun.steps.length,
            assertionCount: session.lastSuccessfulRun.steps.filter((step) => step.type.startsWith('assert_')).length,
          },
        };
      });
    }, 'BROWSER_GENERATE_PLAYWRIGHT_FAILED');
  }
);

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
      return await withSessionOrThrow(sessionId, async (session) => {
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
      return await withSessionOrThrow(sessionId, async (session) => {
        const path = await artifactManager.writeText(sessionId, 'dom', 'html', await session.page.content());
        return { ok: true, path };
      });
    }, 'BROWSER_SNAPSHOT_DOM_FAILED');
  }
);

server.registerTool(
  'browser_save_storage_state',
  {
    description: 'Persist the Playwright storage state for the current session.',
    inputSchema: {
      sessionId: z.string(),
    },
  },
  async ({ sessionId }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const path = await artifactManager.nextPath(sessionId, 'storage-state', 'json');
        await session.context.storageState({ path });
        return { ok: true, path };
      });
    }, 'BROWSER_SAVE_STORAGE_STATE_FAILED');
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
      const session = browserManager.getSession(sessionId);
      if (!session) {
        throw createError('SESSION_NOT_FOUND', `Unknown session: ${sessionId}`, { sessionId });
      }
      await persistSiteKnowledge(session);
      const closed = await browserManager.closeSession(sessionId);
      if (!closed) {
        throw createError('SESSION_NOT_FOUND', `Unknown session: ${sessionId}`, { sessionId });
      }
      return { ok: closed };
    }, 'BROWSER_CLOSE_FAILED');
  }
);

const transport = new StdioServerTransport();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void browserManager.closeAll().finally(() => process.exit(0));
  });
}

await server.connect(transport);
