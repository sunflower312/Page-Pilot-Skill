import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const readControlStateScript = `
  const checkbox = document.querySelector('#checkbox-example input[type="checkbox"]');
  const checkboxButton = document.querySelector('#checkbox-example button');
  const input = document.querySelector('#input-example input[type="text"]');
  const inputButton = document.querySelector('#input-example button');
  return {
    checkboxExists: Boolean(checkbox),
    checkboxChecked: checkbox?.checked ?? null,
    checkboxButton: checkboxButton?.textContent?.trim() ?? null,
    inputDisabled: input?.disabled ?? null,
    inputValue: input?.value ?? null,
    inputButton: inputButton?.textContent?.trim() ?? null,
    message: document.querySelector('#message')?.textContent?.trim() ?? null,
  };
`;

function buildWaitForStateScript(expected) {
  return `
    const expected = ${JSON.stringify(expected)};
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const checkbox = document.querySelector('#checkbox-example input[type="checkbox"]');
      const checkboxButton = document.querySelector('#checkbox-example button');
      const input = document.querySelector('#input-example input[type="text"]');
      const inputButton = document.querySelector('#input-example button');
      const current = {
        checkboxExists: Boolean(checkbox),
        checkboxChecked: checkbox?.checked ?? null,
        checkboxButton: checkboxButton?.textContent?.trim() ?? null,
        inputDisabled: input?.disabled ?? null,
        inputValue: input?.value ?? null,
        inputButton: inputButton?.textContent?.trim() ?? null,
        message: document.querySelector('#message')?.textContent?.trim() ?? null,
      };
      const matches = Object.entries(expected).every(([key, value]) => current[key] === value);
      if (matches) {
        return current;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(\`Timed out waiting for state: \${JSON.stringify(expected)}\`);
  `;
}

const verifyFilledInputScript = `
  const input = document.querySelector('#input-example input[type="text"]');
  const button = document.querySelector('#input-example button');
  if (!input) {
    throw new Error('The dynamic-controls input field is missing.');
  }
  if (input.disabled) {
    throw new Error('The dynamic-controls input field is still disabled.');
  }
  if (input.value !== 'Benchmark ready') {
    throw new Error(\`Expected the enabled input to contain "Benchmark ready", got "\${input.value}".\`);
  }
  if (button?.textContent?.trim() !== 'Disable') {
    throw new Error('The input toggle button did not switch to Disable.');
  }
  return {
    inputDisabled: input.disabled,
    inputValue: input.value,
    inputButton: button?.textContent?.trim() ?? null,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the dynamic controls page', 'brief');
        const initial = await runProbe(
          context,
          sessionId,
          'Record the initial dynamic-controls state',
          readControlStateScript,
          (data) => ({
            checkboxExists: data.checkboxExists,
            checkboxButton: data.checkboxButton,
            inputDisabled: data.inputDisabled,
            inputButton: data.inputButton,
          })
        );
        await validatePlaywright(context, sessionId, 'Remove the checkbox control', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Remove' } } },
          { type: 'wait_for', value: 5000 },
        ]);
        const removed = await runProbe(
          context,
          sessionId,
          'Wait for the removed-checkbox state',
          buildWaitForStateScript({
            checkboxExists: false,
            checkboxButton: 'Add',
            inputDisabled: true,
            inputButton: 'Enable',
            message: "It's gone!",
          }),
          (data) => ({
            checkboxExists: data.checkboxExists,
            checkboxButton: data.checkboxButton,
            inputDisabled: data.inputDisabled,
            inputButton: data.inputButton,
            message: data.message,
          })
        );
        await validatePlaywright(context, sessionId, 'Restore the checkbox control', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Add' } } },
          { type: 'wait_for', value: 5000 },
        ]);
        const restored = await runProbe(
          context,
          sessionId,
          'Wait for the restored-checkbox state',
          buildWaitForStateScript({
            checkboxExists: true,
            checkboxButton: 'Remove',
            inputDisabled: true,
            inputButton: 'Enable',
            message: "It's back!",
          }),
          (data) => ({
            checkboxExists: data.checkboxExists,
            checkboxButton: data.checkboxButton,
            inputDisabled: data.inputDisabled,
            inputButton: data.inputButton,
            message: data.message,
          })
        );
        await validatePlaywright(context, sessionId, 'Enable the input field', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Enable' } } },
          { type: 'wait_for', value: 5000 },
        ]);
        const enabled = await runProbe(
          context,
          sessionId,
          'Wait for the enabled-input state',
          buildWaitForStateScript({
            checkboxExists: true,
            checkboxButton: 'Remove',
            inputDisabled: false,
            inputButton: 'Disable',
            message: "It's enabled!",
          }),
          (data) => ({
            checkboxExists: data.checkboxExists,
            checkboxButton: data.checkboxButton,
            inputDisabled: data.inputDisabled,
            inputButton: data.inputButton,
            message: data.message,
          })
        );
        await validatePlaywright(context, sessionId, 'Fill the enabled input field', [
          {
            type: 'fill',
            locator: { strategy: 'css', value: '#input-example input[type="text"]' },
            value: 'Benchmark ready',
          },
        ]);
        const filled = await runProbe(
          context,
          sessionId,
          'Verify the enabled input value',
          verifyFilledInputScript,
          (data) => ({
            inputDisabled: data.inputDisabled,
            inputValue: data.inputValue,
            inputButton: data.inputButton,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'the-internet-dynamic-controls-state'));
        return {
          summary: 'Removed and restored the checkbox, enabled the input, and filled the now-editable field.',
          details: {
            initial: initial.data,
            removed: removed.data,
            restored: restored.data,
            enabled: enabled.data,
            filled: filled.data,
          },
        };
      },
      { url: 'https://the-internet.herokuapp.com/dynamic_controls' }
    );

    return finalizeScenario(sessionRun);
  },
};
