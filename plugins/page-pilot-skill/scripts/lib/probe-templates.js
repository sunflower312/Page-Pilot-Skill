import { executeReadonlyScriptProbe } from './script-execution.js';

const READONLY_VIOLATION_RULES = [
  { reason: 'document_write', pattern: /\bdocument\.(?:title|body|head)\s*=/i },
  { reason: 'document_write', pattern: /\bdocument\.(?:write|writeln|open|close)\s*\(/i },
  { reason: 'dom_event', pattern: /\.\s*(?:click|submit|focus|blur|dispatchEvent)\s*\(/i },
  {
    reason: 'dom_write',
    pattern:
      /\.\s*(?:append|appendChild|prepend|after|before|remove|replaceWith|insertAdjacent(?:Element|HTML|Text)|setAttribute|removeAttribute)\s*\(/i,
  },
  { reason: 'dom_write', pattern: /\.\s*classList\.(?:add|remove|toggle|replace)\s*\(/i },
  { reason: 'html_write', pattern: /\.\s*(?:innerHTML|outerHTML|textContent|innerText|value)\s*=/i },
  { reason: 'storage_write', pattern: /\b(?:localStorage|sessionStorage)\.(?:setItem|removeItem|clear)\s*\(/i },
  { reason: 'storage_write', pattern: /\b(?:localStorage|sessionStorage)\s*\[\s*['"](?:setItem|removeItem|clear)['"]\s*\]\s*\(/i },
  { reason: 'storage_write', pattern: /\b(?:localStorage|sessionStorage)\s*\?\.\s*(?:setItem|removeItem|clear)\s*\(/i },
  { reason: 'navigation_write', pattern: /\b(?:window\.)?location\.(?:assign|replace|reload)\s*\(/i },
  { reason: 'navigation_write', pattern: /\b(?:window\.)?location\s*=/i },
  { reason: 'navigation_write', pattern: /\b(?:window\.)?location\s*\[\s*['"](?:assign|replace|reload)['"]\s*\]\s*\(/i },
  { reason: 'navigation_write', pattern: /\bhistory\.(?:pushState|replaceState|back|forward|go)\s*\(/i },
  { reason: 'navigation_write', pattern: /\bhistory\s*\[\s*['"](?:pushState|replaceState|back|forward|go)['"]\s*\]\s*\(/i },
  { reason: 'navigation_write', pattern: /\bhistory\s*\?\.\s*(?:pushState|replaceState|back|forward|go)\s*\(/i },
  { reason: 'network_side_effect', pattern: /\bfetch\s*\(/i },
  { reason: 'network_side_effect', pattern: /\b(?:window|globalThis)\s*\[\s*['"]fetch['"]\s*\]\s*\(/i },
  { reason: 'network_side_effect', pattern: /\b(?:(?:window|globalThis)\.)?fetch\s*\?\.\s*\(/i },
  { reason: 'network_side_effect', pattern: /\b(?:window|globalThis)\s*\?\.\s*fetch\s*\?\.\s*\(/i },
  { reason: 'html_write', pattern: /\.\s*(?:innerHTML|outerHTML|textContent|innerText|value)\s*=|(?:\[['"](?:innerHTML|outerHTML|textContent|innerText|value)['"]\]\s*=)/i },
  { reason: 'potential_infinite_loop', pattern: /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)|\bsetInterval\s*\(/i },
];

function createReadonlyViolationError(reason, source) {
  const error = new Error(`Readonly probe rejected because it matched a blocked operation: ${reason}`);
  error.code = 'PROBE_READONLY_VIOLATION';
  error.details = { reason, source };
  return error;
}

export function validateReadonlyProbe(probe = {}) {
  const source = String(probe?.source ?? '');

  for (const rule of READONLY_VIOLATION_RULES) {
    if (rule.pattern.test(source)) {
      throw createReadonlyViolationError(rule.reason, source);
    }
  }
}

function buildDocumentSnapshotSource(probe = {}) {
  const includeTitle = probe.includeTitle !== false;
  const includeUrl = probe.includeUrl !== false;
  const includeText = probe.includeText !== false;
  const maxTextLength = Math.min(Math.max(probe.maxTextLength ?? 2000, 1), 4000);

  return `
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const bodyText = normalize(document.body?.innerText || document.body?.textContent || '');
    return {
      title: ${includeTitle ? 'document.title' : 'null'},
      url: ${includeUrl ? 'location.href' : 'null'},
      text: ${includeText ? `bodyText.slice(0, ${maxTextLength})` : 'null'},
      textLength: bodyText.length,
    };
  `;
}

function buildSelectorSnapshotSource(probe = {}) {
  const selector = JSON.stringify(String(probe.selector ?? ''));
  const maxItems = Math.min(Math.max(probe.maxItems ?? 5, 1), 20);
  const includeText = probe.includeText !== false;
  const includeGeometry = probe.includeGeometry === true;

  return `
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const selector = ${selector};
    const nodes = [...document.querySelectorAll(selector)];
    const elements = nodes.slice(0, ${maxItems}).map((node, index) => {
      const rect = node.getBoundingClientRect?.();
      return {
        index,
        tag: node.tagName?.toLowerCase?.() ?? null,
        id: node.id || null,
        text: ${includeText ? "normalize(node.innerText || node.textContent || '') || null" : 'null'},
        value: 'value' in node ? node.value ?? null : null,
        checked: typeof node.checked === 'boolean' ? node.checked : null,
        disabled: typeof node.disabled === 'boolean' ? node.disabled : null,
        ariaLabel: node.getAttribute?.('aria-label') || null,
        geometry: ${
          includeGeometry
            ? `rect
          ? {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            }
          : null`
            : 'null'
        },
      };
    });
    return {
      selector,
      count: nodes.length,
      elements,
    };
  `;
}

export async function executeProbeTemplate(page, probe = {}) {
  if (probe.template === 'document_snapshot') {
    return executeReadonlyScriptProbe(page, {
      source: buildDocumentSnapshotSource(probe),
      timeoutMs: probe.timeoutMs ?? 3000,
    });
  }

  if (probe.template === 'selector_snapshot') {
    return executeReadonlyScriptProbe(page, {
      source: buildSelectorSnapshotSource(probe),
      timeoutMs: probe.timeoutMs ?? 3000,
    });
  }

  const error = new Error(`Unsupported probe template: ${probe.template}`);
  error.code = 'PROBE_TEMPLATE_UNSUPPORTED';
  error.details = { template: probe.template ?? null };
  throw error;
}

export async function executeReadonlyInternalProbe(page, probe = {}) {
  validateReadonlyProbe(probe);
  return executeReadonlyScriptProbe(page, {
    source: probe.source,
    timeoutMs: probe.timeoutMs ?? 3000,
  });
}
