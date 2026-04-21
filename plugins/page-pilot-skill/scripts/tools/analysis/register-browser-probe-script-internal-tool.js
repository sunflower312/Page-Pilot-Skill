export function registerBrowserProbeScriptInternalTool(server, definition) {
  const { browserManager, executeReadonlyInternalProbe, handleTool, withSessionOrThrow } = definition;

  server.registerTool(
    'browser_probe_script_internal',
    {
      description: 'Internal benchmark-only readonly script probe. Not part of the public Page Pilot Skill contract.',
      inputSchema: definition.inputSchema,
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
