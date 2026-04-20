import { z } from 'zod';

import { generatePlaywrightTest } from '../lib/playwright-generator.js';
import { buildRepairCandidate, buildValidationResult } from '../lib/playwright-validation.js';
import { executeSessionActions } from '../lib/session-action-execution.js';
import { actionSchema, MAX_VALIDATION_STEPS } from '../schemas/tool-schemas.js';
import { handleTool, createError, withSessionOrThrow } from './tool-helpers.js';
import { buildSessionValidationEvidence, shouldAttemptLocatorRepair, storeValidation } from './playwright-evidence.js';

export function registerPlaywrightTools(server, { browserManager, artifactManager }) {
  server.registerTool(
    'browser_validate_playwright',
    {
      description: 'Execute a bounded validation sequence in the current session and return structured locator, assertion, and stability evidence for code generation.',
      inputSchema: {
        sessionId: z.string(),
        steps: z.array(actionSchema).max(MAX_VALIDATION_STEPS),
      },
    },
    async ({ sessionId, steps }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
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
      description: "Generate Playwright TypeScript from the current session's accumulated passed validation evidence and locator ranking results.",
      inputSchema: {
        sessionId: z.string(),
        testName: z.string().default('generated flow').optional(),
        includeImports: z.boolean().default(true).optional(),
        includeTestWrapper: z.boolean().default(true).optional(),
      },
    },
    async ({ sessionId, testName = 'generated flow', includeImports = true, includeTestWrapper = true }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
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
        steps: z.array(actionSchema).max(MAX_VALIDATION_STEPS),
      },
    },
    async ({ sessionId, steps }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
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
              repairedArtifacts: null,
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
              repairedArtifacts: null,
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
          const repairedArtifacts = repairedValidation.validation.passed
            ? generatePlaywrightTest({
                testName: 'repaired flow',
                startUrl: repairedValidation.source.startUrl,
                validationEvidence: repairedValidation,
              })
            : null;
          repairedValidation.repairAttempted = true;
          repairedValidation.repairStrategy = candidate.repairs[0]?.kind ?? null;
          repairedValidation.revalidated = true;
          repairedValidation.repairedArtifacts = repairedArtifacts
            ? {
                language: 'ts',
                framework: 'playwright-test',
                code: repairedArtifacts.code,
                warnings: repairedArtifacts.warnings,
                locatorChoices: repairedArtifacts.locatorChoices,
                fallbackLocatorChoices: repairedArtifacts.fallbackLocatorChoices,
                expectedStateChanges: repairedArtifacts.expectedStateChanges,
                assertionPlan: repairedArtifacts.assertionPlan,
                generatedPlan: repairedArtifacts.generatedPlan,
                metrics: repairedArtifacts.metrics,
                source: {
                  sessionId,
                  generatedFrom: 'repair_validation_evidence',
                  startUrl: repairedValidation.source.startUrl,
                  finalUrl: repairedValidation.source.finalUrl,
                  actionCount: repairedValidation.validation.metrics.actionCount,
                  assertionCount: repairedValidation.validation.metrics.assertionCount,
                },
              }
            : null;
          repairedValidation.warnings = repairedArtifacts?.warnings ?? [];
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
}
