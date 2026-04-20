import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { ArtifactManager } from './lib/artifact-manager.js';
import { BrowserManager } from './lib/browser-manager.js';
import { deriveSemanticTargetFromLocator, rankSemanticTarget } from './lib/locator-ranking-tool.js';
import { verifyLocatorCandidate } from './lib/locator-runtime.js';
import { executeGeneratedPlaywrightCode } from './lib/playwright-code-execution.js';
import { generatePlaywrightTest } from './lib/playwright-generator.js';
import { buildRepairCandidate, buildValidationResult } from './lib/playwright-validation.js';
import { executeProbeTemplate, executeReadonlyInternalProbe } from './lib/probe-templates.js';
import { executeSessionActions } from './lib/session-action-execution.js';
import { collectStructuredPageData } from './lib/structured-scan.js';

const artifactRoot = fileURLToPath(new URL('../../../artifacts/page-pilot-skill', import.meta.url));
const browserManager = new BrowserManager({ artifactRoot, idleMs: 300000 });
const artifactManager = new ArtifactManager(artifactRoot);
const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
const waitUntilSchema = z.enum(['commit', 'domcontentloaded', 'load', 'networkidle']);
const roleLocatorSchema = z.object({
  strategy: z.literal('role'),
  value: z.object({
    role: z.string().min(1),
    name: z.string().min(1),
    exact: z.boolean().optional().default(true),
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
const semanticTargetSchema = z.object({
  role: z.string().min(1).optional(),
  accessibleName: z.string().min(1).optional(),
  visibleText: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  attributes: z
    .object({
      label: z.string().min(1).optional(),
      placeholder: z.string().min(1).optional(),
      testId: z.string().min(1).optional(),
    })
    .partial()
    .optional(),
  css: z.string().min(1).optional(),
  stableFingerprint: z
    .object({
      role: z.string().min(1).optional(),
      accessibleName: z.string().min(1).optional(),
      testId: z.string().min(1).optional(),
      context: z
        .object({
          withinDialog: z.boolean().optional(),
          withinForm: z.boolean().optional(),
          withinMain: z.boolean().optional(),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),
});
const actionStabilitySchema = z
  .object({
    after: z.enum(['auto', 'none']).default('auto').optional(),
    timeoutMs: z.number().int().positive().optional(),
    settleMs: z.number().int().positive().optional(),
    minObserveMs: z.number().int().positive().optional(),
  })
  .optional();
const expectedStateChangeSchema = z
  .object({
    kind: z.enum(['any', 'url_change', 'dom_change', 'text_change', 'no_change']).default('any').optional(),
    urlIncludes: z.string().min(1).optional(),
    textIncludes: z.string().min(1).optional(),
  })
  .optional();
const locatableActionFields = {
  locator: locatorSchema,
  fallbackLocators: z.array(locatorSchema).optional(),
  stability: actionStabilitySchema,
  expectedStateChange: expectedStateChangeSchema,
};
const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    url: z.string().min(1),
    waitUntil: waitUntilSchema.optional(),
    stability: actionStabilitySchema,
    expectedStateChange: expectedStateChangeSchema,
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
const publicProbeSchemas = [
  z.object({
    template: z.literal('document_snapshot'),
    includeTitle: z.boolean().optional(),
    includeUrl: z.boolean().optional(),
    includeText: z.boolean().optional(),
    maxTextLength: z.number().int().positive().max(4000).optional(),
    timeoutMs: z.number().int().positive().max(10000).default(3000).optional(),
  }),
  z.object({
    template: z.literal('selector_snapshot'),
    selector: z.string().min(1),
    maxItems: z.number().int().positive().max(20).optional(),
    includeText: z.boolean().optional(),
    includeGeometry: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(10000).default(3000).optional(),
  }),
];

const probeSchema = z.discriminatedUnion('template', [
  ...publicProbeSchemas,
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

function quoteLocatorValue(value) {
  return JSON.stringify(value);
}

function toPlaywrightExpression(locator = {}) {
  if (locator.strategy === 'role') {
    const exact = locator.value?.exact !== false;
    return `page.getByRole(${quoteLocatorValue(locator.value.role)}, { name: ${quoteLocatorValue(locator.value.name)}, exact: ${exact ? 'true' : 'false'} })`;
  }
  if (locator.strategy === 'label') {
    return `page.getByLabel(${quoteLocatorValue(locator.value)})`;
  }
  if (locator.strategy === 'text') {
    return `page.getByText(${quoteLocatorValue(locator.value)}, { exact: true })`;
  }
  if (locator.strategy === 'placeholder') {
    return `page.getByPlaceholder(${quoteLocatorValue(locator.value)})`;
  }
  if (locator.strategy === 'testId') {
    return `page.getByTestId(${quoteLocatorValue(locator.value)})`;
  }
  return `page.locator(${quoteLocatorValue(locator.value)})`;
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

async function handleTool(callback, fallbackCode) {
  try {
    return formatResult(await callback());
  } catch (error) {
    return formatError(error, fallbackCode);
  }
}

function storeValidation(session, validation, originalSteps) {
  const storedValidation = {
    ...validation,
    originalSteps,
  };
  session.lastValidation = storedValidation;
  if (!Array.isArray(session.validationHistory)) {
    session.validationHistory = [];
  }
  if (storedValidation.validation?.passed) {
    session.validationHistory.push(storedValidation);
  } else {
    session.validationHistory = [];
  }
  return session.lastValidation;
}

function shouldAttemptLocatorRepair(validation) {
  if (!validation || validation.validation?.passed) {
    return false;
  }

  if (validation.failureKind !== 'ACTION_STEP_FAILED') {
    return false;
  }

  const failedStepIndex = validation.error?.stepIndex;
  const failedStep = Number.isInteger(failedStepIndex) ? validation.steps?.[failedStepIndex] : null;
  const originalFailedStep = Number.isInteger(failedStepIndex) ? validation.originalSteps?.[failedStepIndex] : null;
  if (!failedStep && !originalFailedStep) {
    return false;
  }

  const failedType = failedStep?.type ?? originalFailedStep?.type;
  if (!['click', 'fill', 'press', 'select', 'check', 'capture'].includes(failedType)) {
    return false;
  }

  return (
    Array.isArray(validation.error?.details?.candidates) ||
    ((failedStep?.fallbackLocatorChoices ?? []).length > 0) ||
    failedStep?.codegenVerification?.unique !== true ||
    failedStep?.codegenVerification?.usable !== true ||
    Boolean(originalFailedStep?.locator)
  );
}

function buildSessionValidationEvidence(session) {
  const history = Array.isArray(session.validationHistory)
    ? session.validationHistory.filter((entry) => entry?.validation?.passed)
    : [];
  const evidenceEntries =
    history.length > 0
      ? history
      : session.lastValidation?.validation?.passed
        ? [session.lastValidation]
        : [];

  if (evidenceEntries.length === 0) {
    return null;
  }

  const combinedSteps = evidenceEntries.flatMap((entry) => entry.steps ?? []);
  const combinedEvidenceSteps = [];
  for (const entry of evidenceEntries) {
    for (const evidenceStep of entry.evidence?.steps ?? []) {
      combinedEvidenceSteps.push({
        ...evidenceStep,
        stepIndex: combinedEvidenceSteps.length,
      });
    }
  }

  const locatorSteps = combinedSteps.filter((step) => step.locatorChoice);
  const semanticLocatorSteps = locatorSteps.filter((step) => step.locatorChoice?.strategy !== 'css');
  const cssFallbackSteps = locatorSteps.filter((step) => step.locatorChoice?.strategy === 'css');
  const uniqueLocatorHits = locatorSteps.filter(
    (step) => step.codegenVerification?.unique === true && step.codegenVerification?.usable === true
  ).length;
  const actionCount = evidenceEntries.reduce((sum, entry) => sum + (entry.validation?.metrics?.actionCount ?? 0), 0);
  const assertionCount = evidenceEntries.reduce((sum, entry) => sum + (entry.validation?.metrics?.assertionCount ?? 0), 0);

  return {
    ...evidenceEntries[evidenceEntries.length - 1],
    source: {
      ...evidenceEntries[evidenceEntries.length - 1].source,
      startUrl: evidenceEntries[0].source?.startUrl ?? evidenceEntries[evidenceEntries.length - 1].source?.startUrl ?? null,
    },
    validation: {
      passed: true,
      firstPass: evidenceEntries.every((entry) => entry.validation?.firstPass === true),
      repaired: evidenceEntries.some((entry) => entry.validation?.repaired === true),
      metrics: {
        semanticLocatorRatio:
          locatorSteps.length === 0 ? null : Number((semanticLocatorSteps.length / locatorSteps.length).toFixed(2)),
        cssFallbackRatio:
          locatorSteps.length === 0 ? null : Number((cssFallbackSteps.length / locatorSteps.length).toFixed(2)),
        uniqueLocatorHitRate:
          locatorSteps.length === 0 ? null : Number((uniqueLocatorHits / locatorSteps.length).toFixed(2)),
        actionCount,
        assertionCount,
      },
    },
    evidence: {
      observation: evidenceEntries[evidenceEntries.length - 1].observation ?? null,
      steps: combinedEvidenceSteps,
    },
    steps: combinedSteps,
    error: null,
  };
}

const server = new McpServer({
  name: 'page-pilot-skill',
  version: '0.1.0',
});

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
  'browser_scan',
  {
    description: 'Collect a structured semantic summary of the current page for locator selection and Playwright code generation.',
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
  'browser_rank_locators',
  {
    description: 'Rank semantic Playwright locator candidates for a target element using the current page scan.',
    inputSchema: {
      sessionId: z.string(),
      target: semanticTargetSchema,
      detailLevel: z.enum(['brief', 'standard', 'full']).default('standard').optional(),
      limit: z.number().int().positive().max(12).default(5).optional(),
    },
  },
  async ({ sessionId, target, detailLevel = 'standard', limit = 5 }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const scan = await collectStructuredPageData(session.page, { detailLevel });
        const ranking = rankSemanticTarget(scan, target, { limit });
        const matches = [];

        for (const match of ranking.matches) {
          const preferredLocator = match.preferredLocator ?? match.recommendedLocators?.[0] ?? null;
          const verification = preferredLocator
            ? await verifyLocatorCandidate(session.page, preferredLocator, 'click').catch(() => null)
            : null;
          matches.push({
            ...match,
            matchCount: verification?.inspection?.count ?? null,
            playwrightExpression: preferredLocator ? toPlaywrightExpression(preferredLocator) : null,
            stabilityReason: match.reasons?.[0] ?? null,
            fallbackReason: preferredLocator?.strategy === 'css' ? 'css_fallback' : null,
          });
        }

        return {
          ...ranking,
          matches,
        };
      });
    }, 'BROWSER_RANK_LOCATORS_FAILED');
  }
);

server.registerTool(
  'browser_probe',
  {
    description: 'Run a readonly probe inside the active page to supplement scan results with focused evidence using bounded templates.',
    inputSchema: {
      sessionId: z.string(),
      probe: probeSchema,
    },
  },
  async ({ sessionId, probe }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const data = await executeProbeTemplate(session.page, probe);
        return { ok: true, template: probe.template, data };
      });
    }, 'BROWSER_PROBE_FAILED');
  }
);

if (process.env.PAGE_PILOT_INTERNAL_PROBE === '1') {
  server.registerTool(
    'browser_probe_script',
    {
      description: 'Internal benchmark-only readonly script probe. Not part of the public Page Pilot Skill contract.',
      inputSchema: {
        sessionId: z.string(),
        source: z.string().min(1),
        timeoutMs: z.number().int().positive().max(30000).default(3000).optional(),
      },
    },
    async ({ sessionId, source, timeoutMs = 3000 }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(sessionId, async (session) => {
          const data = await executeReadonlyInternalProbe(session.page, { source, timeoutMs });
          return { ok: true, template: 'readonly_script', data };
        });
      }, 'BROWSER_PROBE_SCRIPT_FAILED');
    }
  );
}

server.registerTool(
  'browser_validate_playwright',
  {
    description: 'Execute a bounded validation sequence in the current session and return structured locator, assertion, and stability evidence for code generation.',
    inputSchema: {
      sessionId: z.string(),
      steps: z.array(actionSchema),
    },
  },
  async ({ sessionId, steps }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        const execution = await executeSessionActions({
          sessionId,
          session,
          actions: steps,
          artifactManager,
        });
        const validation = await buildValidationResult({
          sessionId,
          before: execution.before,
          after: execution.after,
          observation: execution.observation,
          result: execution.result,
          page: session.page,
        });
        storeValidation(session, validation, steps);
        return validation;
      });
    }, 'BROWSER_VALIDATE_PLAYWRIGHT_FAILED');
  }
);

server.registerTool(
  'browser_generate_playwright',
  {
    description: 'Generate Playwright TypeScript from the latest validated semantic evidence and locator ranking results.',
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
        const validationEvidence = buildSessionValidationEvidence(session);
        if (!validationEvidence?.validation?.passed) {
          throw createError('NO_VALIDATED_FLOW', `No passed validation evidence found for session: ${sessionId}`, {
            sessionId,
          });
        }

        const generated = generatePlaywrightTest({
          testName,
          startUrl: validationEvidence.source.startUrl,
          validationEvidence,
          includeImports,
          includeTestWrapper,
        });

        return {
          ok: true,
          language: 'ts',
          framework: 'playwright-test',
          code: generated.code,
          warnings: generated.warnings,
          locatorChoices: generated.locatorChoices,
          fallbackLocatorChoices: generated.fallbackLocatorChoices,
          expectedStateChanges: generated.expectedStateChanges,
          assertionPlan: generated.assertionPlan,
          generatedPlan: generated.generatedPlan,
          metrics: generated.metrics,
          source: {
            sessionId,
            generatedFrom: 'validated_playwright_evidence',
            startUrl: validationEvidence.source.startUrl,
            finalUrl: validationEvidence.source.finalUrl,
            actionCount: validationEvidence.validation.metrics.actionCount,
            assertionCount: validationEvidence.validation.metrics.assertionCount,
          },
        };
      });
    }, 'BROWSER_GENERATE_PLAYWRIGHT_FAILED');
  }
);

server.registerTool(
  'browser_repair_playwright',
  {
    description: 'Attempt a bounded repair of a failed validation by re-ranking locator candidates and re-validating the adjusted steps.',
    inputSchema: {
      sessionId: z.string(),
      steps: z.array(actionSchema),
    },
  },
  async ({ sessionId, steps }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        let baseline = session.lastValidation;
        if (!baseline || JSON.stringify(baseline.originalSteps ?? []) !== JSON.stringify(steps)) {
          const execution = await executeSessionActions({
            sessionId,
            session,
            actions: steps,
            artifactManager,
          });
          baseline = storeValidation(
            session,
            await buildValidationResult({
              sessionId,
              before: execution.before,
              after: execution.after,
              observation: execution.observation,
              result: execution.result,
              page: session.page,
            }),
            steps
          );
        }

        if (baseline.validation?.passed) {
          return {
            ...baseline,
            repairAttempted: false,
            repairStrategy: null,
            revalidated: false,
            repairedCode: null,
            warnings: [],
          };
        }

        const candidate = shouldAttemptLocatorRepair(baseline)
          ? buildRepairCandidate({
              steps,
              failedStepIndex: baseline.error?.stepIndex ?? -1,
              scan: baseline.scan,
            })
          : null;
        if (!candidate) {
          return {
            ...baseline,
            repairAttempted: false,
            repairStrategy: null,
            revalidated: false,
            repairedCode: null,
            warnings: [],
          };
        }

        if (session.initialUrl) {
          await session.page.goto(session.initialUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        }

        const repairExecution = await executeSessionActions({
          sessionId,
          session,
          actions: candidate.repairedSteps,
          artifactManager,
        });
        const repairedValidation = await buildValidationResult({
          sessionId,
          before: repairExecution.before,
          after: repairExecution.after,
          observation: repairExecution.observation,
          result: repairExecution.result,
          page: session.page,
        });
        repairedValidation.validation.firstPass = false;
        repairedValidation.validation.repaired = repairedValidation.validation.passed;
        const repairedCode = repairedValidation.validation.passed
          ? generatePlaywrightTest({
              testName: 'repaired flow',
              startUrl: repairedValidation.source.startUrl,
              validationEvidence: repairedValidation,
            })
          : null;
        repairedValidation.repairAttempted = true;
        repairedValidation.repairStrategy = candidate.repairs[0]?.kind ?? null;
        repairedValidation.revalidated = true;
        repairedValidation.repairedCode = repairedCode?.code ?? null;
        repairedValidation.warnings = repairedCode?.warnings ?? [];
        repairedValidation.repair = {
          attempted: true,
          repaired: repairedValidation.validation.passed,
          repairs: candidate.repairs,
        };
        storeValidation(session, repairedValidation, candidate.repairedSteps);
        return repairedValidation;
      });
    }, 'BROWSER_REPAIR_PLAYWRIGHT_FAILED');
  }
);

server.registerTool(
  'browser_validate_playwright_code',
  {
    description: 'Execute generated Playwright snippet code against the current session to verify that the emitted code itself runs successfully.',
    inputSchema: {
      sessionId: z.string(),
      code: z.string().min(1),
    },
  },
  async ({ sessionId, code }) => {
    return handleTool(async () => {
      return await withSessionOrThrow(sessionId, async (session) => {
        await executeGeneratedPlaywrightCode(session.page, code);
        return {
          ok: true,
          finalUrl: session.page.url?.() ?? null,
          finalTitle: await session.page.title().catch(() => null),
        };
      });
    }, 'BROWSER_VALIDATE_PLAYWRIGHT_CODE_FAILED');
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

const transport = new StdioServerTransport();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void browserManager.closeAll().finally(() => process.exit(0));
  });
}

await server.connect(transport);
