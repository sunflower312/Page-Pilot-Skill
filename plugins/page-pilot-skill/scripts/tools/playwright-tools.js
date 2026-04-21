import { z } from 'zod';

import { generatePlaywrightTest } from '../lib/playwright-generator.js';
import { buildRepairCandidate, buildValidationResult } from '../lib/playwright-validation.js';
import { executeSessionActions } from '../lib/session-action-execution.js';
import { actionSchema, MAX_VALIDATION_STEPS } from '../schemas/tool-schemas.js';
import { handleTool, createError, withSessionOrThrow } from './tool-helpers.js';
import { buildSessionValidationEvidence, shouldAttemptLocatorRepair, storeValidation } from './playwright-evidence.js';
import { registerBrowserGeneratePlaywrightTool } from './playwright/register-browser-generate-playwright-tool.js';
import { registerBrowserRepairPlaywrightTool } from './playwright/register-browser-repair-playwright-tool.js';
import { registerBrowserValidatePlaywrightTool } from './playwright/register-browser-validate-playwright-tool.js';

const playwrightStepsInputSchema = {
  sessionId: z.string(),
  steps: z.array(actionSchema).max(MAX_VALIDATION_STEPS),
};

export function registerPlaywrightTools(server, { browserManager, artifactManager }) {
  registerBrowserValidatePlaywrightTool(server, {
    browserManager,
    artifactManager,
    executeSessionActions,
    buildValidationResult,
    storeValidation,
    handleTool,
    withSessionOrThrow,
    inputSchema: playwrightStepsInputSchema,
  });

  registerBrowserGeneratePlaywrightTool(server, {
    browserManager,
    generatePlaywrightTest,
    buildSessionValidationEvidence,
    createError,
    handleTool,
    withSessionOrThrow,
    inputSchema: {
      sessionId: z.string(),
      testName: z.string().default('generated flow').optional(),
      includeImports: z.boolean().default(true).optional(),
      includeTestWrapper: z.boolean().default(true).optional(),
    },
  });

  registerBrowserRepairPlaywrightTool(server, {
    browserManager,
    artifactManager,
    executeSessionActions,
    buildValidationResult,
    buildRepairCandidate,
    shouldAttemptLocatorRepair,
    storeValidation,
    generatePlaywrightTest,
    handleTool,
    withSessionOrThrow,
    inputSchema: playwrightStepsInputSchema,
  });
}
