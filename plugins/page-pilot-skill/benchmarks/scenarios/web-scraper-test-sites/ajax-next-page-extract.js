import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const readAjaxCatalogPageScript = `
  const readActivePage = () => {
    const activeControl = [...document.querySelectorAll('.pagination button, .pagination li')]
      .find((node) => node.classList.contains('active'));
    if (!activeControl) {
      return null;
    }
    return activeControl.textContent?.replace(/\\s+/g, ' ').trim() ?? null;
  };
  const titles = [...document.querySelectorAll('.thumbnail .title')]
    .map((node) => node.textContent.trim())
    .filter(Boolean);
  if (titles.length < 3) {
    throw new Error('The AJAX catalogue did not expose enough product titles.');
  }
  return {
    activePage: readActivePage(),
    titles,
  };
`;

function buildVerifyLaterAjaxPageScript(beforeTitles) {
  return `
    const readActivePage = () => {
      const activeControl = [...document.querySelectorAll('.pagination button, .pagination li')]
        .find((node) => node.classList.contains('active'));
      if (!activeControl) {
        return null;
      }
      return activeControl.textContent?.replace(/\\s+/g, ' ').trim() ?? null;
    };
    const beforeTitles = ${JSON.stringify(beforeTitles)};
    const titles = [...document.querySelectorAll('.thumbnail .title')]
      .map((node) => node.textContent.trim())
      .filter(Boolean);
    if (titles.length < 3) {
      throw new Error('The later AJAX page did not expose enough product titles.');
    }
    if (JSON.stringify(titles.slice(0, 4)) === JSON.stringify(beforeTitles.slice(0, 4))) {
      throw new Error('The visible AJAX product set did not change after moving to the next page.');
    }
    return {
      activePage: readActivePage(),
      titles,
    };
  `;
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the AJAX catalogue page', 'brief');
        const before = await executeScript(
          context,
          sessionId,
          'Read the initial AJAX catalogue page',
          readAjaxCatalogPageScript,
          (data) => ({
            activePage: data.activePage,
            firstTitle: data.titles[0] ?? null,
            count: data.titles.length,
          })
        );
        await runActions(context, sessionId, 'Move to page 2 of the AJAX catalogue', [
          { type: 'click', locator: { strategy: 'css', value: 'button.page-link.page[data-id=\"2\"]' } },
        ]);
        const after = await executeScript(
          context,
          sessionId,
          'Verify the later AJAX catalogue page',
          buildVerifyLaterAjaxPageScript(before.data.titles),
          (data) => ({
            activePage: data.activePage,
            firstTitle: data.titles[0] ?? null,
            count: data.titles.length,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'web-scraper-ajax-next-page-extract'));
        return {
          summary: 'Moved to a later AJAX catalogue page and verified the visible product set changed.',
          details: {
            before: before.data,
            after: after.data,
          },
        };
      },
      { url: 'https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops' }
    );

    return finalizeScenario(sessionRun);
  },
};
