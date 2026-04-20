import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const measureScrollGrowthScript = `
  const readyDeadline = Date.now() + 5000;
  while (Date.now() < readyDeadline && document.querySelectorAll('.quote').length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const initialCount = document.querySelectorAll('.quote').length;
  if (initialCount < 10) {
    throw new Error(\`Expected at least 10 quotes before scrolling, got \${initialCount}.\`);
  }
  window.scrollTo(0, document.body.scrollHeight);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const currentCount = document.querySelectorAll('.quote').length;
    if (currentCount > initialCount) {
      return {
        initialCount,
        finalCount: currentCount,
        grew: true,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Quote count did not increase after scrolling.');
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the infinite-scroll quotes page', 'brief');
        const measurement = await runProbe(
          context,
          sessionId,
          'Scroll the page and verify quote growth',
          measureScrollGrowthScript,
          (data) => ({
            initialCount: data.initialCount,
            finalCount: data.finalCount,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'toscrape-scroll-growth'));
        return {
          summary: `Quote count grew from ${measurement.data.initialCount} to ${measurement.data.finalCount} after scrolling.`,
          details: measurement.data,
        };
      },
      { url: 'https://quotes.toscrape.com/scroll' }
    );

    return finalizeScenario(sessionRun);
  },
};
