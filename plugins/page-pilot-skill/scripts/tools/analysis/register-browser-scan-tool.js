export function registerBrowserScanTool(server, definition) {
  const { browserManager, collectStructuredPageData, handleTool, withSessionOrThrow } = definition;

  server.registerTool(
    'browser_scan',
    {
      description: 'Collect a structured semantic summary of the current page for locator selection and Playwright code generation.',
      inputSchema: definition.inputSchema,
    },
    async ({ sessionId, detailLevel = 'standard', focus, includeSpecializedControls = false, verification }) => {
      return handleTool(async () => {
        return await withSessionOrThrow(browserManager, sessionId, async (session) => {
          return await collectStructuredPageData(session.page, {
            detailLevel,
            focus,
            includeSpecializedControls,
            verification,
          });
        });
      }, 'BROWSER_SCAN_FAILED');
    }
  );
}
