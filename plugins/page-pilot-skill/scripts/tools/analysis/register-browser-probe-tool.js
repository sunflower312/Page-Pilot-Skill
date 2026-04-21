export function registerBrowserProbeTool(server, definition) {
  const { browserManager, executeProbeTemplate, handleTool, withSessionOrThrow, inputSchema } = definition;

  server.registerTool(
    'browser_probe',
    {
      description: 'Run a readonly probe inside the active page to supplement scan results with focused evidence using bounded templates.',
      inputSchema,
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
}
