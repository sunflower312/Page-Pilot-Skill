import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

function createFilmSnapshotScript(options = {}) {
  const { waitForRows = false, expectedHash = null, baselineTitles = [] } = options;

  return `
    const expectedHash = ${JSON.stringify(expectedHash)};
    const baselineTitles = ${JSON.stringify(baselineTitles)};

    function collectSnapshot() {
      const films = [...document.querySelectorAll('.film')]
        .map((entry) => ({
          title: entry.querySelector('.film-title')?.textContent?.trim(),
          nominations: entry.querySelector('.film-nominations')?.textContent?.trim(),
          awards: entry.querySelector('.film-awards')?.textContent?.trim(),
        }))
        .filter((film) => film.title);

      return {
        hash: location.hash,
        count: films.length,
        titles: films.map((film) => film.title),
        films: films.slice(0, 5),
      };
    }

    function validateLoadedSnapshot(snapshot) {
      if (expectedHash && snapshot.hash !== expectedHash) {
        throw new Error(\`Expected URL hash \${expectedHash} but received \${snapshot.hash || '(empty)'}.\`);
      }
      if (snapshot.count === 0) {
        throw new Error('The 2015 AJAX response did not render any film rows.');
      }
      if (snapshot.titles.join('||') === baselineTitles.join('||')) {
        throw new Error('The film dataset did not change after selecting the 2015 filter.');
      }
    }

    ${waitForRows ? 'const deadline = Date.now() + 8000;' : ''}
    ${waitForRows ? 'while (Date.now() < deadline) {' : ''}
    const snapshot = collectSnapshot();
    ${waitForRows ? 'if (snapshot.count > 0) {' : ''}
    ${waitForRows ? '  validateLoadedSnapshot(snapshot);' : ''}
    ${waitForRows ? '  return snapshot;' : 'return snapshot;'}
    ${waitForRows ? '}' : ''}
    ${waitForRows ? 'await new Promise((resolve) => setTimeout(resolve, 200));' : ''}
    ${waitForRows ? '}' : ''}
    ${waitForRows ? "throw new Error('Timed out waiting for the 2015 AJAX film rows.');" : ''}
  `;
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(context, async ({ sessionId, addArtifact }) => {
      await scanPage(context, sessionId, 'Scan the AJAX film page', 'brief');
      const baseline = await executeScript(
        context,
        sessionId,
        'Capture the film rows before selecting a year',
        createFilmSnapshotScript(),
        (data) => ({
          hash: data.hash,
          count: data.count,
          firstTitle: data.titles[0] ?? null,
        })
      );
      await runActions(context, sessionId, 'Load the 2015 film list', [
        { type: 'click', locator: { strategy: 'role', value: { role: 'link', name: '2015' } } },
        { type: 'assert_url', value: '#2015' },
      ]);
      const extraction = await executeScript(
        context,
        sessionId,
        'Extract the loaded AJAX film rows',
        createFilmSnapshotScript({
          waitForRows: true,
          expectedHash: '#2015',
          baselineTitles: baseline.data.titles,
        }),
        (data) => ({
          hash: data.hash,
          count: data.count,
          firstTitle: data.films[0]?.title ?? null,
        })
      );
      addArtifact(await captureScreenshot(context, sessionId, 'scrape-this-site-ajax-2015'));
      return {
        summary: `Loaded ${extraction.data.count} AJAX film rows for ${extraction.data.hash}.`,
        details: {
          beforeSelection: baseline.data,
          afterSelection: extraction.data,
        },
      };
    });

    return finalizeScenario(sessionRun);
  },
};
