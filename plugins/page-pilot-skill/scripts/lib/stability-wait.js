export function browserWaitForStability({
  settleMs,
  minObserveMs,
  stabilityKey,
  stateKey = '__agentBrowserStability',
}) {
  const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const roots = [document];

  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const hosts = Array.from(root.querySelectorAll?.('*') ?? []).filter((element) => element.shadowRoot);
    for (const host of hosts) {
      roots.push(host.shadowRoot);
    }
  }

  const countAcrossRoots = (selector) =>
    roots.reduce((total, root) => total + (root.querySelectorAll?.(selector).length ?? 0), 0);
  const collectAcrossRoots = (selector, limit = Number.POSITIVE_INFINITY) => {
    const elements = [];

    for (const root of roots) {
      if (elements.length >= limit) {
        break;
      }
      const matches = root.querySelectorAll?.(selector) ?? [];
      for (const element of matches) {
        elements.push(element);
        if (elements.length >= limit) {
          break;
        }
      }
    }

    return elements;
  };
  const readInteractiveText = (element) => {
    const tagName = element?.tagName?.toLowerCase?.() ?? '';
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return element.value || element.getAttribute('aria-label') || element.textContent || '';
    }
    return element.textContent || element.getAttribute('aria-label') || element.value || '';
  };
  const textSample = compact(
    roots
      .map((root) => root.body?.innerText ?? root.innerText ?? root.textContent ?? '')
      .filter(Boolean)
      .join('\n')
  ).slice(0, 2000);
  const interactiveState = collectAcrossRoots(
    'button, input, select, textarea, [role="button"], [tabindex]',
    50
  )
    .map((element) => ({
      tag: element.tagName,
      id: element.id || '',
      name: element.getAttribute('name') || '',
      text: compact(readInteractiveText(element)).slice(0, 80),
      disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
      hidden:
        element.hidden === true ||
        window.getComputedStyle(element).display === 'none' ||
        window.getComputedStyle(element).visibility === 'hidden',
      className: String(element.className ?? ''),
    }))
    .map((entry) => JSON.stringify(entry))
    .join('|');
  const signature = JSON.stringify({
    readyState: document.readyState,
    url: window.location.href,
    title: document.title,
    textSample,
    busyCount: countAcrossRoots('[aria-busy="true"], [role="progressbar"], .loading, .spinner, .busy'),
    disabledCount: countAcrossRoots(
      'button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"]'
    ),
    hiddenInteractiveCount: countAcrossRoots(
      'button[hidden], input[hidden], select[hidden], textarea[hidden], [role="button"][hidden], [tabindex][hidden]'
    ),
    interactiveState,
  });
  const now = Date.now();
  const currentState = window[stateKey];

  if (!currentState || currentState.key !== stabilityKey) {
    window[stateKey] = {
      key: stabilityKey,
      signature,
      at: now,
      startedAt: now,
    };
    return false;
  }

  if (currentState.signature !== signature) {
    window[stateKey] = {
      key: stabilityKey,
      signature,
      at: now,
      startedAt: currentState.startedAt ?? now,
    };
    return false;
  }

  return now - currentState.at >= settleMs && now - currentState.startedAt >= minObserveMs;
}
