import { mergeVerifiedLocatorChoices } from '../response-shaping.js';

export function registerBrowserRankLocatorsTool(server, definition) {
  const {
    browserManager,
    collectStructuredPageData,
    rankSemanticTarget,
    buildLocatorChoices,
    handleTool,
    withSessionOrThrow,
    inputSchema,
  } = definition;

  server.registerTool(
    'browser_rank_locators',
    {
      description: 'Rank semantic Playwright locator candidates for a target element using the current page scan.',
      inputSchema,
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
}
