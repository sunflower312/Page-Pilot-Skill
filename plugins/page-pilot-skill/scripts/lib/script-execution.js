const TRANSIENT_EXECUTION_CONTEXT_PATTERNS = [
  /Execution context was destroyed/i,
  /Cannot find context with specified id/i,
  /Frame was detached/i,
];
const NAVIGATION_EXECUTION_CONTEXT_PATTERN =
  /^page\.evaluate:\s*Execution context was destroyed, most likely because of a navigation\b/i;

export function serializeForTransport(value, depth = 0, seen = new WeakSet()) {
  const clip = (input) => String(input ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const describeNode = (node) => {
    if (node?.nodeType === 9) {
      return { $type: 'document', url: node.URL || node.baseURI || undefined };
    }

    return {
      $type: node?.nodeType === 1 ? 'element' : 'node',
      tag: node?.tagName?.toLowerCase?.() || undefined,
      nodeName: node?.nodeName || undefined,
      id: node?.id || undefined,
      selector: node?.id ? `#${node.id}` : undefined,
      text: clip(node?.innerText || node?.textContent || '') || undefined,
    };
  };

  if (value == null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : { $type: 'number', value: String(value) };
  }
  if (typeof value === 'bigint') {
    return { $type: 'bigint', value: value.toString() };
  }
  if (typeof value === 'symbol') {
    return { $type: 'symbol', value: value.description || String(value) };
  }
  if (typeof value === 'function') {
    return { $type: 'function', name: value.name || 'anonymous' };
  }
  if (value === globalThis.window) {
    return { $type: 'window', url: globalThis.location?.href };
  }
  if (value === globalThis.document || (value && typeof value.nodeType === 'number' && typeof value.nodeName === 'string')) {
    return describeNode(value);
  }
  if (value instanceof Date) {
    return { $type: 'date', value: value.toISOString() };
  }
  if (value instanceof RegExp) {
    return { $type: 'regexp', value: String(value) };
  }
  if (value instanceof Error) {
    return { $type: 'error', name: value.name, message: value.message };
  }
  if (depth >= 4) {
    return { $type: 'max-depth', kind: value?.constructor?.name || typeof value };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => serializeForTransport(entry, depth + 1, seen));
  }
  if (value instanceof Map) {
    return {
      $type: 'map',
      entries: Array.from(value.entries())
        .slice(0, 10)
        .map(([key, entry]) => [
          serializeForTransport(key, depth + 1, seen),
          serializeForTransport(entry, depth + 1, seen),
        ]),
    };
  }
  if (value instanceof Set) {
    return {
      $type: 'set',
      values: Array.from(value.values())
        .slice(0, 20)
        .map((entry) => serializeForTransport(entry, depth + 1, seen)),
    };
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return { $type: 'circular' };
    }
    seen.add(value);

    const output = {};
    for (const [key, entry] of Object.entries(value).slice(0, 20)) {
      output[key] = serializeForTransport(entry, depth + 1, seen);
    }
    if (value.constructor && value.constructor !== Object) {
      output.$type = value.constructor.name;
    }

    seen.delete(value);
    return output;
  }

  return { $type: 'unserializable', value: Object.prototype.toString.call(value) };
}

export function isTransientExecutionContextError(error) {
  if (error?.code === 'SCRIPT_EXECUTION_CONTEXT_DESTROYED') {
    return true;
  }

  const message = String(error?.message ?? '');
  return TRANSIENT_EXECUTION_CONTEXT_PATTERNS.some((pattern) => pattern.test(message));
}

export function isNavigationInterruptionError(error) {
  return error?.code === 'SCRIPT_EXECUTION_CONTEXT_DESTROYED';
}

function isNavigationDrivenExecutionContextError(error) {
  return NAVIGATION_EXECUTION_CONTEXT_PATTERN.test(String(error?.message ?? ''));
}

function createNavigationInterruptionError(error) {
  const wrapped = new Error(error?.message ?? 'Execution context was destroyed');
  wrapped.code = 'SCRIPT_EXECUTION_CONTEXT_DESTROYED';
  wrapped.cause = error;
  return wrapped;
}

export async function executeScript(page, script) {
  try {
    return await page.evaluate(
      async ({ source, serializerSource }) => {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction(source);
        const serialize = new Function(`return (${serializerSource});`)();
        return serialize(await fn());
      },
      {
        source: script,
        serializerSource: serializeForTransport.toString(),
      }
    );
  } catch (error) {
    if (isNavigationDrivenExecutionContextError(error)) {
      throw createNavigationInterruptionError(error);
    }
    throw error;
  }
}
