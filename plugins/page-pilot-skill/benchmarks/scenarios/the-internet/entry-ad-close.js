import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const waitForVisibleModalScript = `
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const modal = document.querySelector('.modal');
    const modalTitle = document.querySelector('.modal-title h3')?.textContent?.trim() ?? null;
    const closeText = document.querySelector('.modal-footer p')?.textContent?.trim() ?? null;
    const modalVisible = Boolean(
      modal &&
        getComputedStyle(modal).display !== 'none' &&
        getComputedStyle(modal).visibility !== 'hidden' &&
        getComputedStyle(modal).opacity !== '0'
    );
    if (modalVisible) {
      return {
        modalVisible,
        modalTitle,
        closeText,
        restartLinkText: document.querySelector('#restart-ad')?.textContent?.trim() ?? null,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the entry-ad modal to appear.');
`;

const verifyClosedModalScript = `
  const modal = document.querySelector('.modal');
  const modalVisible = Boolean(
    modal &&
      getComputedStyle(modal).display !== 'none' &&
      getComputedStyle(modal).visibility !== 'hidden' &&
      getComputedStyle(modal).opacity !== '0'
  );
  if (modalVisible) {
    throw new Error('The entry-ad modal remained visible after clicking Close.');
  }
  const restartLinkText = document.querySelector('#restart-ad')?.textContent?.trim() ?? null;
  if (restartLinkText !== 'click here') {
    throw new Error('The entry-ad restart link text changed unexpectedly.');
  }
  return {
    modalVisible,
    modalExists: Boolean(modal),
    restartLinkText,
    closeText: document.querySelector('.modal-footer p')?.textContent?.trim() ?? null,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the entry-ad page', 'brief');
        const before = await runProbe(
          context,
          sessionId,
          'Wait for the entry-ad modal to appear',
          waitForVisibleModalScript,
          (data) => ({
            modalVisible: data.modalVisible,
            modalTitle: data.modalTitle,
            closeText: data.closeText,
          })
        );
        await validatePlaywright(context, sessionId, 'Close the entry-ad modal', [
          { type: 'click', locator: { strategy: 'text', value: 'Close' } },
        ]);
        const after = await runProbe(
          context,
          sessionId,
          'Verify that the entry-ad modal is hidden',
          verifyClosedModalScript,
          (data) => ({
            modalVisible: data.modalVisible,
            modalExists: data.modalExists,
            restartLinkText: data.restartLinkText,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'the-internet-entry-ad-closed'));
        return {
          summary: 'Closed the entry-ad modal and verified that the page returned to its non-modal state.',
          details: {
            before: before.data,
            after: after.data,
          },
        };
      },
      { url: 'https://the-internet.herokuapp.com/entry_ad' }
    );

    return finalizeScenario(sessionRun);
  },
};
