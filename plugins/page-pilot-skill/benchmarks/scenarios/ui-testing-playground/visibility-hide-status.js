import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const readVisibilityStateScript = `
  const ids = ['removedButton', 'zeroWidthButton', 'overlappedButton', 'transparentButton', 'invisibleButton', 'notdisplayedButton', 'offscreenButton'];
  const overlappedButton = document.getElementById('overlappedButton');
  const overlappedRect = overlappedButton?.getBoundingClientRect();
  const overlappedTop = overlappedRect
    ? document.elementFromPoint(overlappedRect.left + overlappedRect.width / 2, overlappedRect.top + overlappedRect.height / 2)
    : null;
  const states = ids.map((id) => {
    const node = document.getElementById(id);
    const style = node ? getComputedStyle(node) : null;
    return {
      id,
      exists: Boolean(node),
      visible: Boolean(node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length)),
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      opacity: style?.opacity ?? null,
    };
  });
  return {
    states,
    hiddenCount: states.filter((state) => !state.exists || !state.visible || state.display === 'none' || state.visibility === 'hidden' || state.opacity === '0').length,
    overlappedTopId: overlappedTop?.id ?? null,
    hidingLayerVisible: (() => {
      const layer = document.getElementById('hidingLayer');
      return Boolean(layer && getComputedStyle(layer).display === 'block');
    })(),
  };
`;

function buildVerifyHiddenStateScript(beforeState) {
  return `
  const ids = ['removedButton', 'zeroWidthButton', 'overlappedButton', 'transparentButton', 'invisibleButton', 'notdisplayedButton', 'offscreenButton'];
  const beforeState = ${JSON.stringify(beforeState)};
  const states = ids.map((id) => {
    const node = document.getElementById(id);
    const style = node ? getComputedStyle(node) : null;
    return {
      id,
      exists: Boolean(node),
      visible: Boolean(node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length)),
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      opacity: style?.opacity ?? null,
    };
  });
  const overlappedButton = document.getElementById('overlappedButton');
  const overlappedRect = overlappedButton?.getBoundingClientRect();
  const overlappedTop = overlappedRect
    ? document.elementFromPoint(overlappedRect.left + overlappedRect.width / 2, overlappedRect.top + overlappedRect.height / 2)
    : null;
  const hiddenCount = states.filter((state) =>
    !state.exists || !state.visible || state.display === 'none' || state.visibility === 'hidden' || state.opacity === '0'
  ).length;
  const changedIds = states
    .filter((state) => {
      const before = beforeState.states.find((entry) => entry.id === state.id);
      return JSON.stringify(before) !== JSON.stringify(state);
    })
    .map((state) => state.id);
  if (changedIds.length < 4) {
    throw new Error(\`Expected multiple target buttons to change state after clicking Hide, but only \${changedIds.length} changed.\`);
  }
  if (overlappedTop?.id !== 'hidingLayer') {
    throw new Error('The overlap layer did not cover the overlapped button after clicking Hide.');
  }
  return {
    states,
    hiddenCount,
    changedIds,
    overlappedTopId: overlappedTop?.id ?? null,
    hidingLayerVisible: (() => {
      const layer = document.getElementById('hidingLayer');
      return Boolean(layer && getComputedStyle(layer).display === 'block');
    })(),
  };
`;
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the visibility playground page', 'brief');
        const before = await executeScript(
          context,
          sessionId,
          'Record the initial button visibility state',
          readVisibilityStateScript,
          (data) => ({ hiddenCount: data.hiddenCount })
        );
        await runActions(context, sessionId, 'Click Hide to change button visibility states', [
          { type: 'click', locator: { strategy: 'css', value: '#hideButton' } },
        ]);
        const after = await executeScript(
          context,
          sessionId,
          'Verify that target buttons changed state and the overlap layer covered the button',
          buildVerifyHiddenStateScript(before.data),
          (data) => ({
            hiddenCount: data.hiddenCount,
            changedIds: data.changedIds,
            overlappedTopId: data.overlappedTopId,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'ui-testing-playground-visibility'));
        return {
          summary: 'Triggered the Hide action and verified the resulting visibility changes.',
          details: {
            before: before.data,
            after: after.data,
          },
        };
      },
      { url: 'http://uitestingplayground.com/visibility' }
    );

    return finalizeScenario(sessionRun);
  },
};
