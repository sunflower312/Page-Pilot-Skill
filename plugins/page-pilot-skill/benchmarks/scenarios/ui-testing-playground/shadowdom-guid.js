import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const installClipboardHookScript = `
  const host = document.querySelector('guid-generator');
  const root = host?.shadowRoot;
  const input = root?.querySelector('#editField');
  const generateButton = root?.querySelector('#buttonGenerate');
  const copyButton = root?.querySelector('#buttonCopy');
  if (!host || !root || !input || !generateButton || !copyButton) {
    throw new Error('The GUID generator shadow-root controls are incomplete.');
  }
  const originalWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard) ?? null;
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: {},
      configurable: true,
    });
  }
  window.__benchmarkClipboardWrites = [];
  navigator.clipboard.writeText = async function(text) {
    window.__benchmarkClipboardWrites.push({ text });
    return originalWriteText ? originalWriteText(text) : undefined;
  };
  return {
    hasOpenShadowRoot: true,
    initialValue: input.value,
    hadOriginalWriteText: Boolean(originalWriteText),
  };
`;

const verifyGeneratedGuidScript = `
  const host = document.querySelector('guid-generator');
  const root = host?.shadowRoot;
  const input = root?.querySelector('#editField');
  const writes = window.__benchmarkClipboardWrites ?? [];
  const copiedText = writes.at(-1)?.text ?? null;
  const value = input?.value ?? null;
  const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guidPattern.test(value ?? '')) {
    throw new Error(\`The generated GUID was missing or malformed: "\${value}".\`);
  }
  if (copiedText !== value) {
    throw new Error(\`Expected the copied GUID to match the input value, got copied="\${copiedText}" value="\${value}".\`);
  }
  return {
    hasOpenShadowRoot: Boolean(root),
    value,
    copiedText,
    writeCount: writes.length,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the shadow DOM GUID page', 'brief');
        const setup = await runProbe(
          context,
          sessionId,
          'Install a clipboard capture hook inside the page',
          installClipboardHookScript,
          (data) => ({
            hasOpenShadowRoot: data.hasOpenShadowRoot,
            initialValue: data.initialValue,
            hadOriginalWriteText: data.hadOriginalWriteText,
          })
        );
        await validatePlaywright(context, sessionId, 'Generate a GUID and copy it from the shadow root', [
          { type: 'click', locator: { strategy: 'css', value: 'guid-generator #buttonGenerate' } },
          { type: 'click', locator: { strategy: 'css', value: 'guid-generator #buttonCopy' } },
        ]);
        const verification = await runProbe(
          context,
          sessionId,
          'Verify the generated GUID format and copied text',
          verifyGeneratedGuidScript,
          (data) => ({
            hasOpenShadowRoot: data.hasOpenShadowRoot,
            writeCount: data.writeCount,
            value: data.value,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'ui-testing-playground-shadowdom-guid'));
        return {
          summary: 'Generated a GUID inside the shadow root and verified that the copied text matched the input value.',
          details: {
            setup: setup.data,
            verification: verification.data,
          },
        };
      },
      { url: 'http://uitestingplayground.com/shadowdom' }
    );

    return finalizeScenario(sessionRun);
  },
};
