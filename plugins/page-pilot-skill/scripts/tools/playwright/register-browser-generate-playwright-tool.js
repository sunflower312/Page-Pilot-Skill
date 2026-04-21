import { buildGeneratedPlaywrightResponse } from '../response-shaping.js';

export function registerBrowserGeneratePlaywrightTool(server, definition) {
  const {
    browserManager,
    generatePlaywrightTest,
    buildSessionValidationEvidence,
    createError,
    handleTool,
    withSessionOrThrow,
  } = definition;

  server.registerTool(
    'browser_generate_playwright',
    {
      description: "Generate Playwright TypeScript from the current session's accumulated passed validation evidence and locator ranking results.",
      inputSchema: definition.inputSchema,
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

          return buildGeneratedPlaywrightResponse({
            sessionId,
            generated,
            generatedFrom: 'validated_playwright_evidence',
            startUrl: validationEvidence.source.startUrl,
            finalUrl: validationEvidence.source.finalUrl,
            actionCount: validationEvidence.validation.metrics.actionCount,
            assertionCount: validationEvidence.validation.metrics.assertionCount,
          });
        });
      }, 'BROWSER_GENERATE_PLAYWRIGHT_FAILED');
    }
  );
}
