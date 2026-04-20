import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const readCheckboxStateScript = `
  const checkboxes = [...document.querySelectorAll('#checkboxes input[type="checkbox"]')].map((node, index) => ({
    index,
    checked: node.checked,
    labelText: node.nextSibling?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
  }));
  if (checkboxes.length !== 2) {
    throw new Error(\`Expected 2 checkbox controls, found \${checkboxes.length}.\`);
  }
  return {
    checkboxes,
    checkedCount: checkboxes.filter((entry) => entry.checked).length,
  };
`;

function buildVerifyToggledScript(beforeState) {
  return `
    const beforeState = ${JSON.stringify(beforeState)};
    const afterState = [...document.querySelectorAll('#checkboxes input[type="checkbox"]')].map((node, index) => ({
      index,
      checked: node.checked,
      labelText: node.nextSibling?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    }));
    if (afterState.length !== beforeState.checkboxes.length) {
      throw new Error('The checkbox count changed after toggling.');
    }
    const flippedIndexes = [];
    for (const beforeEntry of beforeState.checkboxes) {
      const afterEntry = afterState.find((entry) => entry.index === beforeEntry.index);
      if (!afterEntry) {
        throw new Error(\`Checkbox \${beforeEntry.index} disappeared after toggling.\`);
      }
      if (afterEntry.checked === beforeEntry.checked) {
        throw new Error(\`Checkbox \${beforeEntry.index} did not change its checked state.\`);
      }
      flippedIndexes.push(beforeEntry.index);
    }
    return {
      checkboxes: afterState,
      checkedCount: afterState.filter((entry) => entry.checked).length,
      flippedIndexes,
    };
  `;
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the checkboxes page', 'brief');
        const before = await runProbe(
          context,
          sessionId,
          'Record the initial checkbox states',
          readCheckboxStateScript,
          (data) => ({
            checkedCount: data.checkedCount,
            checkboxes: data.checkboxes,
          })
        );
        await validatePlaywright(context, sessionId, 'Toggle both checkboxes', [
          { type: 'click', locator: { strategy: 'css', value: '#checkboxes input:nth-of-type(1)' } },
          { type: 'click', locator: { strategy: 'css', value: '#checkboxes input:nth-of-type(2)' } },
        ]);
        const after = await runProbe(
          context,
          sessionId,
          'Verify that both checkbox states flipped',
          buildVerifyToggledScript(before.data),
          (data) => ({
            checkedCount: data.checkedCount,
            flippedIndexes: data.flippedIndexes,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'the-internet-checkboxes-toggle'));
        return {
          summary: 'Toggled both checkboxes and verified that each control flipped its checked state.',
          details: {
            before: before.data,
            after: after.data,
          },
        };
      },
      { url: 'https://the-internet.herokuapp.com/checkboxes' }
    );

    return finalizeScenario(sessionRun);
  },
};
