import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractFormFieldsScript = `
  const fields = [...document.querySelectorAll('input, select, textarea')]
    .filter((field) => field.type !== 'hidden')
    .map((field) => ({
      tag: field.tagName,
      type: field.type,
      id: field.id || null,
      name: field.name || null,
      value: field.value || '',
      checked: field.checked === true,
    }));
  const hiddenValue = document.querySelector('input[type="hidden"]')?.value ?? null;
  if (fields.length < 10) {
    throw new Error(\`Expected a complex form, found only \${fields.length} visible fields.\`);
  }
  if (!hiddenValue) {
    throw new Error('The hidden field value is missing from the form challenge.');
  }
  return {
    fieldCount: fields.length,
    hiddenValue,
    sample: fields.slice(0, 8),
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the complex form challenge', 'brief');
        const extraction = await runProbe(
          context,
          sessionId,
          'Extract visible and hidden form data',
          extractFormFieldsScript,
          (data) => ({
            fieldCount: data.fieldCount,
            hiddenValueLength: data.hiddenValue?.length ?? 0,
            firstFieldName: data.sample[0]?.name ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'tryscrapeme-form-fields'));
        return {
          summary: `Extracted ${extraction.data.fieldCount} visible fields and the hidden token from the form challenge.`,
          details: extraction.data,
        };
      },
      { url: 'https://tryscrapeme.com/web-scraping-practice/beginner/form' }
    );

    return finalizeScenario(sessionRun);
  },
};
