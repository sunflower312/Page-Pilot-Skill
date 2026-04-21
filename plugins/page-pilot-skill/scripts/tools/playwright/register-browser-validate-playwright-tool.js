export function registerBrowserValidatePlaywrightTool(server, definition) {
  const {
    browserManager,
    artifactManager,
    executeSessionActions,
    buildValidationResult,
    storeValidation,
    handleTool,
    withSessionOrThrow,
    inputSchema,
  } = definition;

  server.registerTool(
    'browser_validate_playwright',
    {
      description: 'Execute a bounded validation sequence in the current session and return structured locator, assertion, and stability evidence for code generation.',
      inputSchema,
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
}
