import { buildBrowserInteractiveRuntimePayload, buildSemanticSnapshot } from './semantic-model.js';
import { isTransientExecutionContextError } from './script-execution.js';

const OBSERVATION_RETRY_ATTEMPTS = 4;
const OBSERVATION_RETRY_TIMEOUT_MS = 1500;
const OBSERVATION_TEXT_LINE_LIMIT = 50;
const OBSERVATION_TEXT_DIFF_LIMIT = 10;

function diffStats(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const delta = {};

  for (const key of keys) {
    delta[key] = (after[key] ?? 0) - (before[key] ?? 0);
  }

  return delta;
}

function areEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function buildChangedDetails(changed, before, after) {
  if (!changed) {
    return undefined;
  }

  return { before: before ?? null, after: after ?? null };
}

function buildSemanticDiff(before = {}, after = {}) {
  const beforeDialog = before.activeDialog ?? null;
  const afterDialog = after.activeDialog ?? null;
  const beforePrimaryAction = before.primaryAction ?? null;
  const afterPrimaryAction = after.primaryAction ?? null;
  const beforeMainRegion = before.regions?.main ?? '';
  const afterMainRegion = after.regions?.main ?? '';
  const beforeFeedback = before.regions?.feedback ?? '';
  const afterFeedback = after.regions?.feedback ?? '';
  const beforeInteraction = before.interaction ?? null;
  const afterInteraction = after.interaction ?? null;

  const dialogChanged = !areEqual(beforeDialog, afterDialog);
  const dialogClosed = Boolean(beforeDialog) && !afterDialog;
  const dialogOpened = !beforeDialog && Boolean(afterDialog);
  const primaryActionChanged = !areEqual(beforePrimaryAction, afterPrimaryAction);
  const mainRegionChanged = beforeMainRegion !== afterMainRegion;
  const feedbackChanged = beforeFeedback !== afterFeedback;
  const interactionStateChanged = !areEqual(beforeInteraction, afterInteraction);
  const reasons = [];

  if (dialogOpened) {
    reasons.push('dialog_opened');
  } else if (dialogClosed) {
    reasons.push('dialog_closed');
  } else if (dialogChanged) {
    reasons.push('dialog_changed');
  }
  if (primaryActionChanged) {
    reasons.push('primary_action_changed');
  }
  if (mainRegionChanged) {
    reasons.push('main_region_changed');
  }
  if (feedbackChanged) {
    reasons.push('feedback_changed');
  }
  if (interactionStateChanged) {
    reasons.push('interaction_state_changed');
  }

  return {
    dialogChanged,
    dialogOpened,
    dialogClosed,
    primaryActionChanged,
    mainRegionChanged,
    feedbackChanged,
    interactionStateChanged,
    details: {
      activeDialog: buildChangedDetails(dialogChanged, beforeDialog, afterDialog),
      primaryAction: buildChangedDetails(primaryActionChanged, beforePrimaryAction, afterPrimaryAction),
      mainRegion: buildChangedDetails(mainRegionChanged, beforeMainRegion, afterMainRegion),
      feedback: buildChangedDetails(feedbackChanged, beforeFeedback, afterFeedback),
      interaction: buildChangedDetails(interactionStateChanged, beforeInteraction, afterInteraction),
    },
    reasons,
  };
}

function buildTextLineCounts(lines = []) {
  const counts = {};

  for (const line of lines) {
    counts[line] = (counts[line] ?? 0) + 1;
  }

  return counts;
}

function normalizeTextLineCounts(snapshot = {}) {
  if (snapshot.textLineCounts && typeof snapshot.textLineCounts === 'object') {
    return snapshot.textLineCounts;
  }

  return buildTextLineCounts(snapshot.textLines ?? []);
}

function listTrackedTextLines(primaryCounts = {}, secondaryCounts = {}, preferredLines = []) {
  const orderedLines = [];
  const seen = new Set();

  for (const line of preferredLines ?? []) {
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    orderedLines.push(line);
  }

  for (const counts of [primaryCounts, secondaryCounts]) {
    for (const line of Object.keys(counts ?? {})) {
      if (seen.has(line)) {
        continue;
      }
      seen.add(line);
      orderedLines.push(line);
    }
  }

  return orderedLines;
}

function collectChangedTextLines(primaryCounts = {}, secondaryCounts = {}, preferredLines = [], predicate) {
  return listTrackedTextLines(primaryCounts, secondaryCounts, preferredLines)
    .filter((line) => predicate(primaryCounts[line] ?? 0, secondaryCounts[line] ?? 0))
    .slice(0, OBSERVATION_TEXT_DIFF_LIMIT);
}

async function waitForObservationRetry(page) {
  if (typeof page.waitForLoadState === 'function') {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: OBSERVATION_RETRY_TIMEOUT_MS });
      return;
    } catch {}
  }

  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(50);
  }
}

function normalizeSnapshot(snapshot = {}) {
  return {
    documentId: snapshot.documentId ?? null,
    readyState: snapshot.readyState ?? null,
    textLines: snapshot.textLines ?? [],
    textLineCounts: normalizeTextLineCounts(snapshot),
    stats: snapshot.stats ?? {},
    semantic: buildSemanticSnapshot(snapshot.semanticRaw ?? snapshot.semantic ?? {}),
  };
}

async function collectSnapshot(page) {
  const [title, snapshot] = await Promise.all([
    page.title(),
    page.evaluate((payload) => {
      const { maxSemanticInteractives, textLineLimit } = payload;
      const identityKey = '__pagePilotDocumentIdentity__';
      if (!Object.prototype.hasOwnProperty.call(globalThis, identityKey)) {
        Object.defineProperty(globalThis, identityKey, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: `${String(performance?.timeOrigin ?? Date.now())}:${Math.random().toString(36).slice(2, 10)}`,
        });
      }

      const instantiateInteractivePriorityRuntime = Function(
        `return (${payload.interactiveRuntimeInstantiatorSource})`
      )();
      const { compactText, clipText, compareInteractivePriority, finalizeInteractiveEntry } =
        instantiateInteractivePriorityRuntime(payload);
      const roots = [document];

      for (let index = 0; index < roots.length; index += 1) {
        const root = roots[index];
        const hosts = Array.from(root.querySelectorAll?.('*') ?? []).filter((element) => element.shadowRoot);
        for (const host of hosts) {
          roots.push(host.shadowRoot);
        }
      }

      const readRootText = (root) => root.body?.innerText ?? root.innerText ?? root.textContent ?? '';
      const textLines = [];
      const textLineCounts = {};

      for (const line of roots
        .flatMap((root) => readRootText(root).split(/\n+/))
        .map(compactText)
        .filter(Boolean)) {
        if (!Object.prototype.hasOwnProperty.call(textLineCounts, line)) {
          if (textLines.length >= textLineLimit) {
            continue;
          }
          textLineCounts[line] = 0;
          textLines.push(line);
        }
        textLineCounts[line] += 1;
      }
      const countAcrossRoots = (selector) =>
        roots.reduce((total, root) => total + (root.querySelectorAll?.(selector).length ?? 0), 0);
      const collectAcrossRoots = (selector, limit = Number.POSITIVE_INFINITY) => {
        const results = [];

        for (const root of roots) {
          if (results.length >= limit) {
            break;
          }
          const matches = root.querySelectorAll?.(selector) ?? [];
          for (const element of matches) {
            results.push(element);
            if (results.length >= limit) {
              break;
            }
          }
        }

        return results;
      };
      const getComputedStyleSafe = (element) => globalThis.getComputedStyle?.(element);
      const isVisible = (element) => {
        if (!element) {
          return false;
        }

        const style = getComputedStyleSafe(element);
        const rect = element.getBoundingClientRect?.() ?? { width: 1, height: 1 };

        return (
          element.hidden !== true &&
          style?.display !== 'none' &&
          style?.visibility !== 'hidden' &&
          parseFloat(style?.opacity ?? '1') > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const getLabel = (element) => {
        if (!element) {
          return '';
        }
        if (element.labels?.length) {
          return compactText(element.labels[0].innerText || element.labels[0].textContent || '');
        }
        if (element.id) {
          return compactText(document.querySelector?.(`label[for="${element.id}"]`)?.innerText ?? '');
        }
        if (typeof element.getAttribute === 'function') {
          return compactText(
            element.getAttribute('aria-label') ||
              element.getAttribute('aria-labelledby') ||
              element.getAttribute('placeholder') ||
              ''
          );
        }
        return '';
      };
      const getName = (element) =>
        compactText(
          element?.getAttribute?.('aria-label') ||
            element?.innerText ||
            element?.textContent ||
            getLabel(element) ||
            element?.getAttribute?.('placeholder') ||
            ''
        );
      const readInteractiveText = (element) => {
        const tagName = element?.tagName?.toLowerCase?.() ?? '';
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          return compactText(element.value || element.getAttribute?.('aria-label') || element.textContent || '');
        }
        return compactText(element.innerText || element.textContent || element.getAttribute?.('aria-label') || '');
      };
      const hasClosestMatch = (element, selector) => Boolean(element?.closest?.(selector));
      const getContextFlags = (element) => ({
        withinMain: hasClosestMatch(element, 'main,[role="main"]'),
        withinForm: hasClosestMatch(element, 'form'),
        withinDialog: hasClosestMatch(element, 'dialog,[role="dialog"]'),
        withinHeader: hasClosestMatch(element, 'header,[role="banner"]'),
        withinFooter: hasClosestMatch(element, 'footer,[role="contentinfo"]'),
        withinNav: hasClosestMatch(element, 'nav,[role="navigation"]'),
        withinAside: hasClosestMatch(element, 'aside,[role="complementary"]'),
      });
      const interactives = [];
      let domIndex = 0;
      const insertPrioritizedInteractive = (entry) => {
        if (interactives.length < maxSemanticInteractives) {
          interactives.push(entry);
          return;
        }

        let worstIndex = 0;
        for (let index = 1; index < interactives.length; index += 1) {
          if (compareInteractivePriority(interactives[worstIndex], interactives[index]) < 0) {
            worstIndex = index;
          }
        }

        if (compareInteractivePriority(entry, interactives[worstIndex]) < 0) {
          interactives[worstIndex] = entry;
        }
      };
      const addInteractive = (group, element, extra = {}) => {
        if (!element) {
          return;
        }
        const entry = finalizeInteractiveEntry({
          group,
          role: extra.role || (group === 'links' ? 'link' : group === 'checkboxes' ? 'checkbox' : 'button'),
          name: getName(element),
          text: readInteractiveText(element),
          label: getLabel(element),
          testId: element.getAttribute?.('data-testid') || '',
          disabled: element.disabled === true,
          ariaDisabled: element.getAttribute?.('aria-disabled'),
          visible: isVisible(element),
          isSubmitControl: extra.isSubmitControl === true,
          domIndex: domIndex++,
          ...getContextFlags(element),
        });
        if (typeof extra.checked === 'boolean') {
          entry.checked = extra.checked;
        }
        insertPrioritizedInteractive(entry);
      };
      for (const button of collectAcrossRoots('button,input[type="button"],input[type="submit"]')) {
        addInteractive('buttons', button, {
          role: 'button',
          isSubmitControl: button.getAttribute?.('type') === 'submit',
        });
      }
      for (const link of collectAcrossRoots('a[href]')) {
        addInteractive('links', link, {
          role: 'link',
        });
      }
      for (const input of collectAcrossRoots(
        'input:not([type]),input[type="text"],input[type="email"],input[type="search"],input[type="url"],input[type="tel"],input[type="password"],input[type="number"]',
      )) {
        addInteractive('inputs', input, { role: input.type === 'search' ? 'searchbox' : 'textbox' });
      }
      for (const select of collectAcrossRoots('select')) {
        addInteractive('selects', select, { role: 'combobox' });
      }
      for (const textarea of collectAcrossRoots('textarea')) {
        addInteractive('textareas', textarea, { role: 'textbox' });
      }
      for (const checkbox of collectAcrossRoots('input[type="checkbox"]')) {
        addInteractive('checkboxes', checkbox, { role: 'checkbox', checked: checkbox.checked === true });
      }

      const dialogs = collectAcrossRoots('dialog,[role="dialog"]', 4).map((element) => ({
        name: getName(element),
        summary: clipText(element.innerText || element.textContent || '', 180),
        text: clipText(element.innerText || element.textContent || '', 220),
        open: element.open === true || (element.getAttribute?.('aria-hidden') !== 'true' && isVisible(element)),
        visible: isVisible(element),
      }));
      const mainRegionElement = collectAcrossRoots('main,[role="main"]', 1).find((element) => isVisible(element)) ?? null;
      const feedbackElements = collectAcrossRoots(
        [
          '[role="status"]',
          '[role="alert"]',
          '[aria-live]:not([aria-live="off"])',
          '[id*="status"]',
          '[class*="status"]',
          '[id*="message"]',
          '[class*="message"]',
          '[id*="toast"]',
          '[class*="toast"]',
          '[id*="error"]',
          '[class*="error"]',
          '[id*="success"]',
          '[class*="success"]',
        ].join(','),
        6
      )
        .filter((element) => isVisible(element))
        .map((element) => clipText(element.innerText || element.textContent || '', 120))
        .filter(Boolean);

      return {
        documentId: globalThis[identityKey],
        readyState: document.readyState,
        textLines,
        textLineCounts,
        stats: {
          buttons: countAcrossRoots('button,input[type="button"],input[type="submit"]'),
          inputs: countAcrossRoots('input,select,textarea'),
          dialogs: countAcrossRoots('dialog,[role="dialog"]'),
          links: countAcrossRoots('a[href]'),
          forms: countAcrossRoots('form'),
        },
        semanticRaw: {
          dialogs,
          interactives,
          regions: {
            dialog: dialogs.find((dialog) => dialog.open !== false)?.summary || '',
            main: clipText(mainRegionElement?.innerText || mainRegionElement?.textContent || readRootText(document.body ?? document), 260),
            feedback: feedbackElements.join(' | '),
          },
          interaction: {
            busyCount: countAcrossRoots('[aria-busy="true"], [role="progressbar"], .loading, .spinner, .busy'),
            disabledCount: countAcrossRoots(
              'button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"]'
            ),
            hiddenInteractiveCount: countAcrossRoots(
              'button[hidden], input[hidden], select[hidden], textarea[hidden], [role="button"][hidden], [tabindex][hidden]'
            ),
            checkedCount: countAcrossRoots('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"]'),
            keyInteractives: interactives,
          },
        },
      };
    }, buildBrowserInteractiveRuntimePayload({
      maxSemanticInteractives: 48,
      textLineLimit: OBSERVATION_TEXT_LINE_LIMIT,
    })),
  ]);
  const normalized = normalizeSnapshot(snapshot);

  return {
    url: page.url(),
    title,
    pages: page.context().pages(),
    documentId: normalized.documentId,
    readyState: normalized.readyState,
    textLines: normalized.textLines,
    textLineCounts: normalized.textLineCounts,
    stats: normalized.stats,
    semantic: normalized.semantic,
  };
}

export async function captureObservationSnapshot(page) {
  for (let attempt = 1; attempt <= OBSERVATION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await collectSnapshot(page);
    } catch (error) {
      if (!isTransientExecutionContextError(error) || attempt === OBSERVATION_RETRY_ATTEMPTS) {
        throw error;
      }
      await waitForObservationRetry(page);
    }
  }

  throw new Error('Unable to capture observation snapshot');
}

export function buildObservation(before, after) {
  const beforeTextLineCounts = normalizeTextLineCounts(before);
  const afterTextLineCounts = normalizeTextLineCounts(after);
  const openedPages = (after.pages ?? [])
    .filter((currentPage) => !(before.pages ?? []).includes(currentPage))
    .map((currentPage) => currentPage.url());
  const semanticDiff = buildSemanticDiff(before.semantic, after.semantic);
  const newText = collectChangedTextLines(
    afterTextLineCounts,
    beforeTextLineCounts,
    after.textLines ?? [],
    (afterCount, beforeCount) => afterCount > beforeCount
  );
  const removedText = collectChangedTextLines(
    beforeTextLineCounts,
    afterTextLineCounts,
    before.textLines ?? [],
    (beforeCount, afterCount) => beforeCount > afterCount
  );

  return {
    documentChanged: Boolean(before.documentId) && Boolean(after.documentId) ? before.documentId !== after.documentId : false,
    urlChanged: before.url !== after.url,
    titleChanged: before.title !== after.title,
    openedPages,
    newText,
    removedText,
    domChange: diffStats(before.stats, after.stats),
    semanticDiff,
    reasons: semanticDiff.reasons,
  };
}

export function hasMainDocumentTransition(before, after) {
  if (before.documentId && after.documentId) {
    return before.documentId !== after.documentId;
  }

  return before.url !== after.url;
}
