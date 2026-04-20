import { z } from 'zod';

import { rankSemanticTarget } from '../lib/semantic-target-ranking.js';
import { executeProbeTemplate, executeReadonlyInternalProbe } from '../lib/probe-templates.js';
import { collectStructuredPageData } from '../lib/structured-scan.js';
import { probeSchema, semanticTargetSchema } from '../schemas/tool-schemas.js';
import { buildLocatorChoices } from './locator-choices.js';
import { handleTool, withSessionOrThrow } from './tool-helpers.js';
import { toPlaywrightExpression } from '../lib/playwright-locator-expression.js';

export function mergeVerifiedLocatorChoices(match = {}, locatorChoices = []) {
  const preferredChoice = locatorChoices[0] ?? null;
  const preferredLocator = preferredChoice?.locator ?? match.preferredLocator ?? null;
  const fallbackLocators = locatorChoices.slice(1).map((choice) => choice.locator).filter(Boolean);
  const element =
    match.element && typeof match.element === 'object'
      ? {
          ...match.element,
          recommendedLocators: locatorChoices,
          preferredLocator,
          fallbackLocators,
        }
      : match.element ?? null;

  return {
    ...match,
    element,
    recommendedLocators: locatorChoices,
    preferredLocator,
    fallbackLocators,
    locatorChoices,
    matchCount: preferredChoice?.matchCount ?? null,
    locatorType: preferredChoice?.locatorType ?? preferredLocator?.strategy ?? null,
    playwrightExpression:
      preferredChoice?.playwrightExpression ??
      (preferredLocator ? toPlaywrightExpression(preferredLocator) : null),
    stabilityReason: preferredChoice?.stabilityReason ?? match.reasons?.[0] ?? null,
    fallbackReason: preferredChoice?.fallbackReason ?? (preferredLocator?.strategy === 'css' ? 'css_fallback' : null),
  };
}

export function registerAnalysisTools(server, { browserManager }) {
  server.registerTool(
    'browser_scan',
    {
      description: 'Collect a structured semantic summary of the current page for locator selection and Playwright code generation.',
      inputSchema: {
        sessionId: z.string(),
        detailLevel: z.enum(['brief', 'standard', 'full']).default('standard').optional(),
        focus: z
          .object({
            kind: z
              .enum(['generic', 'form_fill', 'dialog', 'search_results', 'table_actions', 'navigation', 'content_extract'])
              .default('generic')
              .optional(),
            targetText: z.string().min(1).optional(),
          })
          .optional(),
        includeSpecializedControls: z.boolean().default(false).optional(),
        verification: z
          .object({
            enabled: z.boolean().default(false).optional(),
            maxPerElement: z.number().int().positive().max(2).default(1).optional(),
            groups: z
              .array(
                z.enum([
                  'buttons',
                  'links',
                  'inputs',
                  'selects',
                  'textareas',
                  'checkboxes',
                  'radios',
                  'switches',
                  'sliders',
                  'tabs',
                  'options',
                  'menuItems',
                  'fileInputs',
                  'dateInputs',
                ])
              )
              .min(1)
              .optional(),
          })
          .optional(),
      },
    },
    async ({ sessionId, detailLevel = 'standard', focus, includeSpecializedControls = false, verification }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
          const scan = await collectStructuredPageData(session.page, {
            detailLevel,
            focus,
            includeSpecializedControls,
            verification,
          });
          return {
            ok: true,
            ...scan,
          };
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
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
          const scan = await collectStructuredPageData(session.page, {
            detailLevel,
            includeSpecializedControls: true,
          });
          const ranking = rankSemanticTarget(scan, target, { limit });
          const matches = [];

          for (const match of ranking.matches) {
            const locatorChoices = await buildLocatorChoices(session.page, match.recommendedLocators ?? [], 'click');
            matches.push(mergeVerifiedLocatorChoices(match, locatorChoices));
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
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
          const data = await executeProbeTemplate(session.page, probe);
          return { ok: true, template: probe.template, data };
        });
      }, 'BROWSER_PROBE_FAILED');
    }
  );

  if (process.env.PAGE_PILOT_INTERNAL_PROBE === '1') {
    server.registerTool(
      'browser_probe_script_internal',
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
          return await withSessionOrThrow(browserManager, sessionId, async (session) => {
            const data = await executeReadonlyInternalProbe(session.page, { source, timeoutMs });
            return { ok: true, template: 'readonly_script', data };
          });
        }, 'BROWSER_PROBE_SCRIPT_INTERNAL_FAILED');
      }
    );
  }
}
