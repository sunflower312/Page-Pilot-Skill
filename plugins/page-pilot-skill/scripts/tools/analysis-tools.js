import { z } from 'zod';

import { rankSemanticTarget } from '../lib/semantic-target-ranking.js';
import { executeProbeTemplate, executeReadonlyInternalProbe } from '../lib/probe-templates.js';
import { collectStructuredPageData } from '../lib/structured-scan.js';
import { probeSchema, semanticTargetSchema } from '../schemas/tool-schemas.js';
import { buildLocatorChoices } from './locator-choices.js';
import { handleTool, withSessionOrThrow } from './tool-helpers.js';
import { registerBrowserProbeScriptInternalTool } from './analysis/register-browser-probe-script-internal-tool.js';
import { registerBrowserProbeTool } from './analysis/register-browser-probe-tool.js';
import { registerBrowserRankLocatorsTool } from './analysis/register-browser-rank-locators-tool.js';
import { registerBrowserScanTool } from './analysis/register-browser-scan-tool.js';

const scanInputSchema = {
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
};

const rankLocatorsInputSchema = {
  sessionId: z.string(),
  target: semanticTargetSchema,
  detailLevel: z.enum(['brief', 'standard', 'full']).default('standard').optional(),
  limit: z.number().int().positive().max(12).default(5).optional(),
};

const internalProbeInputSchema = {
  sessionId: z.string(),
  source: z.string().min(1),
  timeoutMs: z.number().int().positive().max(30000).default(3000).optional(),
};

export function registerAnalysisTools(server, { browserManager }) {
  registerBrowserScanTool(server, {
    browserManager,
    collectStructuredPageData,
    handleTool,
    withSessionOrThrow,
    inputSchema: scanInputSchema,
  });

  registerBrowserRankLocatorsTool(server, {
    browserManager,
    collectStructuredPageData,
    rankSemanticTarget,
    buildLocatorChoices,
    handleTool,
    withSessionOrThrow,
    inputSchema: rankLocatorsInputSchema,
  });

  registerBrowserProbeTool(server, {
    browserManager,
    executeProbeTemplate,
    handleTool,
    withSessionOrThrow,
    inputSchema: {
      sessionId: z.string(),
      probe: probeSchema,
    },
  });

  if (process.env.PAGE_PILOT_INTERNAL_PROBE === '1') {
    registerBrowserProbeScriptInternalTool(server, {
      browserManager,
      executeReadonlyInternalProbe,
      handleTool,
      withSessionOrThrow,
      inputSchema: internalProbeInputSchema,
    });
  }
}
