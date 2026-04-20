import { buildBrowserInteractiveRuntimePayload } from './interactive-priority.js';
import { BROWSER_COLLECTION_SETTINGS, normalizeRawScan } from './structured-scan-shaping.js';
import { collectStructuredPageDataRuntime } from './structured-scan-runtime.js';

export async function collectStructuredPageData(pageLike, { detailLevel = 'standard' } = {}) {
  const settings = BROWSER_COLLECTION_SETTINGS[detailLevel] ?? BROWSER_COLLECTION_SETTINGS.standard;
  const raw = await pageLike.evaluate(
    collectStructuredPageDataRuntime,
    buildBrowserInteractiveRuntimePayload({
      detailLevel,
      settings,
    })
  );

  return normalizeRawScan(raw, detailLevel);
}
