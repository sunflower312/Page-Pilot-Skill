import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const inspectIframeScript = `
  function validateTableRows(rows) {
    if (rows.length < 2) {
      throw new Error('The iframe table did not expose enough rows.');
    }
    const header = rows[0];
    if (!Array.isArray(header) || header.length === 0 || header.some((cell) => !cell)) {
      throw new Error('The iframe table header is empty or malformed.');
    }
    const firstRows = rows.slice(1, 4);
    if (firstRows.length === 0) {
      throw new Error('The iframe table did not expose any sample data rows.');
    }
    for (const [index, row] of firstRows.entries()) {
      if (row.length !== header.length) {
        throw new Error(\`Sample row #\${index + 1} does not align with the table header.\`);
      }
      if (row.some((cell) => !cell)) {
        throw new Error(\`Sample row #\${index + 1} contains empty cells.\`);
      }
    }
    return {
      rowCount: rows.length,
      header,
      firstRows,
    };
  }

  const iframe = document.querySelector('iframe');
  if (!iframe) {
    throw new Error('The benchmark page does not expose an iframe element.');
  }

  const payload = {
    iframeSrc: iframe.src ?? null,
    directAccess: false,
    accessError: null,
    rowCount: 0,
    header: null,
    firstRows: [],
    accessMode: 'parent-document-probe',
  };

  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document ?? null;
    const rows = [...(doc?.querySelectorAll('table tr') ?? [])].map((row) =>
      [...row.querySelectorAll('th,td')].map((cell) => cell.textContent.trim())
    );
    if (rows.length >= 2) {
      const validated = validateTableRows(rows);
      payload.directAccess = true;
      payload.rowCount = validated.rowCount;
      payload.header = validated.header;
      payload.firstRows = validated.firstRows;
      payload.accessMode = 'contentDocument';
    }
  } catch (error) {
    payload.accessError = {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
    };
  }

  return payload;
`;

const extractReferencedDocumentScript = `
  function validateTableRows(rows) {
    if (rows.length < 2) {
      throw new Error('The referenced document did not expose enough table rows.');
    }
    const header = rows[0];
    if (!Array.isArray(header) || header.length === 0 || header.some((cell) => !cell)) {
      throw new Error('The iframe table header is empty or malformed.');
    }
    const firstRows = rows.slice(1, 4);
    if (firstRows.length === 0) {
      throw new Error('The iframe table did not expose any sample data rows.');
    }
    for (const [index, row] of firstRows.entries()) {
      if (row.length !== header.length) {
        throw new Error(\`Sample row #\${index + 1} does not align with the table header.\`);
      }
      if (row.some((cell) => !cell)) {
        throw new Error(\`Sample row #\${index + 1} contains empty cells.\`);
      }
    }
    return {
      rowCount: rows.length,
      header,
      firstRows,
    };
  }

  const rows = [...document.querySelectorAll('table tr')].map((row) =>
    [...row.querySelectorAll('th,td')].map((cell) => cell.textContent.trim())
  );
  const validated = validateTableRows(rows);
  return {
    rowCount: validated.rowCount,
    header: validated.header,
    firstRows: validated.firstRows,
    accessMode: 'followup-session',
    documentUrl: location.href,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(context, async ({ sessionId, addArtifact }) => {
      await scanPage(context, sessionId, 'Scan the iframe practice page', 'brief');
      const iframeProbe = await runProbe(
        context,
        sessionId,
        'Inspect the embedded iframe from the parent page DOM',
        inspectIframeScript,
        (data) => ({
          iframeSrc: data.iframeSrc,
          directAccess: data.directAccess,
          accessMode: data.accessMode,
          accessError: data.accessError,
        })
      );

      if (iframeProbe.data.directAccess) {
        throw new Error(
          'The TryScrapeMe iframe became directly readable from the parent document. Re-qualify this scenario before treating it as a cross-origin iframe benchmark.'
        );
      }
      if (!iframeProbe.data.iframeSrc) {
        throw new Error('The parent page probe did not expose an iframe source URL.');
      }
      if (iframeProbe.data.accessError?.name !== 'SecurityError') {
        throw new Error('The parent page did not surface the expected cross-origin iframe access error.');
      }

      const referencedDocumentRun = await context.withSession(
        { url: iframeProbe.data.iframeSrc },
        async (frameSessionId, frameSession) => {
          context.recordStep('Open the iframe source as a dedicated follow-up document', 'passed', {
            url: frameSession.url ?? iframeProbe.data.iframeSrc,
            title: frameSession.title ?? null,
            parentAccessError: iframeProbe.data.accessError,
          });
          return await runProbe(
            context,
            frameSessionId,
            'Extract rows from the iframe source document DOM',
            extractReferencedDocumentScript,
            (data) => ({
              documentUrl: data.documentUrl,
              rowCount: data.rowCount,
              firstRow: data.firstRows[0] ?? null,
              accessMode: data.accessMode,
            })
          );
        }
      );

      const extractionData = {
        iframeSrc: iframeProbe.data.iframeSrc,
        rowCount: referencedDocumentRun.data.rowCount,
        header: referencedDocumentRun.data.header,
        firstRows: referencedDocumentRun.data.firstRows,
        accessMode: referencedDocumentRun.data.accessMode,
        documentUrl: referencedDocumentRun.data.documentUrl,
        crossOriginBoundaryConfirmed: true,
        parentAccessError: iframeProbe.data.accessError,
      };

      addArtifact(await captureScreenshot(context, sessionId, 'tryscrapeme-iframe-page'));
      return {
        summary: `Detected a cross-origin iframe and extracted ${extractionData.rowCount - 1} table row(s) from its referenced document.`,
        details: extractionData,
      };
    });

    return finalizeScenario(sessionRun);
  },
};
