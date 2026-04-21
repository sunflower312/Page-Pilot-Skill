import { buildGeneratedPlaywrightResponse } from '../response-shaping.js';

export function registerBrowserRepairPlaywrightTool(server, definition) {
  const {
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
    inputSchema,
  } = definition;

  server.registerTool(
    'browser_repair_playwright',
    {
      description: 'Attempt a bounded repair of a failed validation by re-ranking locator candidates and re-validating the adjusted steps.',
      inputSchema,
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
            ? buildGeneratedPlaywrightResponse({
                sessionId,
                generated: repairedArtifacts,
                generatedFrom: 'repair_validation_evidence',
                startUrl: repairedValidation.source.startUrl,
                finalUrl: repairedValidation.source.finalUrl,
                actionCount: repairedValidation.validation.metrics.actionCount,
                assertionCount: repairedValidation.validation.metrics.assertionCount,
              })
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
