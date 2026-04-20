import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const attachProbeScript = `
  const button = [...document.querySelectorAll('button')].find((candidate) =>
    candidate.textContent.trim() === 'Button with Dynamic ID'
  );
  if (!button) {
    throw new Error('The dynamic-ID button is missing.');
  }
  button.dataset.benchmarkClicked = '0';
  button.addEventListener(
    'click',
    () => {
      button.dataset.benchmarkClicked = String(Number(button.dataset.benchmarkClicked || '0') + 1);
    },
    { once: false }
  );
  return {
    currentId: button.id || null,
  };
`;

const verifyProbeScript = `
  const button = [...document.querySelectorAll('button')].find((candidate) =>
    candidate.textContent.trim() === 'Button with Dynamic ID'
  );
  const clickCount = Number(button?.dataset?.benchmarkClicked ?? '0');
  if (!button) {
    throw new Error('The dynamic-ID button disappeared.');
  }
  if (clickCount < 1) {
    throw new Error('The dynamic-ID button did not receive the click event.');
  }
  return {
    currentId: button.id || null,
    clickCount,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the dynamic ID playground page', 'brief');
        const before = await runProbe(
          context,
          sessionId,
          'Attach a click probe to the dynamic-ID button',
          attachProbeScript,
          (data) => ({ currentId: data.currentId })
        );
        await validatePlaywright(context, sessionId, 'Click the dynamic-ID button by accessible name', [
          {
            type: 'click',
            locator: { strategy: 'role', value: { role: 'button', name: 'Button with Dynamic ID' } },
          },
        ]);
        const after = await runProbe(
          context,
          sessionId,
          'Verify that the click probe observed the interaction',
          verifyProbeScript,
          (data) => ({
            currentId: data.currentId,
            clickCount: data.clickCount,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'ui-testing-playground-dynamic-id'));
        return {
          summary: 'Clicked the dynamic-ID button using a stable accessible locator.',
          details: {
            before: before.data,
            after: after.data,
          },
        };
      },
      { url: 'http://uitestingplayground.com/dynamicid' }
    );

    return finalizeScenario(sessionRun);
  },
};
