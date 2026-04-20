import { runActions } from './action-runner.js';
import { buildObservation, captureObservationSnapshot } from './observation.js';
import { collectStructuredPageData } from './structured-scan.js';

async function captureActionArtifact(sessionId, action, page, locator, artifactManager) {
  if (!artifactManager) {
    return null;
  }

  const path = await artifactManager.nextPath(sessionId, 'action-capture', 'png');
  if (locator?.screenshot) {
    await locator.screenshot({ path });
  } else {
    await page.screenshot({ path, fullPage: true });
  }
  return path;
}

export async function executeSessionActions({ sessionId, session, actions, artifactManager } = {}) {
  const before = await captureObservationSnapshot(session.page);
  const result = await runActions(session.page, actions, {
    capture: async (action, page, locator) => captureActionArtifact(sessionId, action, page, locator, artifactManager),
  });
  const after = await captureObservationSnapshot(session.page);
  const semanticScan = await collectStructuredPageData(session.page, { detailLevel: 'brief' }).catch(() => null);

  return {
    before,
    after,
    observation: buildObservation(before, after),
    result,
    semanticScan,
  };
}
