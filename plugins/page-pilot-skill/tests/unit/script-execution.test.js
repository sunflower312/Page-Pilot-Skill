import test from 'node:test';
import assert from 'node:assert/strict';

import { executeReadonlyScriptProbe, serializeForTransport } from '../../scripts/lib/script-execution.js';
import { executeProbeTemplate, validateReadonlyProbe } from '../../scripts/lib/probe-templates.js';

test('serializeForTransport downgrades circular and DOM-like values', () => {
  const element = {
    nodeType: 1,
    nodeName: 'P',
    tagName: 'P',
    id: 'message',
    textContent: 'Hello world',
  };
  const payload = { element };
  payload.self = payload;

  const serialized = serializeForTransport(payload);

  assert.equal(serialized.element.$type, 'element');
  assert.equal(serialized.element.id, 'message');
  assert.equal(serialized.self.$type, 'circular');
});

test('executeReadonlyScriptProbe serializes non-plain return values inside page context', async () => {
  const page = {
    async evaluate(fn, input) {
      globalThis.window = { location: { href: 'http://fixture.local/' } };
      globalThis.location = globalThis.window.location;
      globalThis.document = { nodeType: 9, nodeName: '#document', URL: 'http://fixture.local/' };
      try {
        return await fn(input);
      } finally {
        delete globalThis.window;
        delete globalThis.location;
        delete globalThis.document;
      }
    },
  };

  const result = await executeReadonlyScriptProbe(page, {
    source: `
      const element = { nodeType: 1, nodeName: 'BUTTON', tagName: 'BUTTON', id: 'save', textContent: 'Save changes' };
      const payload = { element, ref: document, current: window };
      payload.self = payload;
      return payload;
    `,
    timeoutMs: 100,
  });

  assert.equal(result.element.$type, 'element');
  assert.equal(result.ref.$type, 'document');
  assert.equal(result.current.$type, 'window');
  assert.equal(result.self.$type, 'circular');
});

test('executeReadonlyScriptProbe marks navigation-driven execution context destruction', async () => {
  const page = {
    async evaluate() {
      throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
    },
  };

  await assert.rejects(
    () =>
      executeReadonlyScriptProbe(page, {
        source: 'return document.title;',
        timeoutMs: 100,
      }),
    (error) => {
      assert.equal(error.code, 'SCRIPT_EXECUTION_CONTEXT_DESTROYED');
      assert.match(error.message, /execution context was destroyed/i);
      return true;
    }
  );
});

test('executeReadonlyScriptProbe surfaces genuine probe failures', async () => {
  const page = {
    async evaluate() {
      throw new Error('Probe exploded');
    },
  };

  await assert.rejects(
    () =>
      executeReadonlyScriptProbe(page, {
        source: 'throw new Error("Probe exploded");',
        timeoutMs: 100,
      }),
    (error) => {
      assert.equal(error.code, undefined);
      assert.equal(error.message, 'Probe exploded');
      return true;
    }
  );
});

test('executeReadonlyScriptProbe rejects oversized serialized payloads', async () => {
  const page = {
    async evaluate(fn, input) {
      return await fn(input);
    },
  };

  await assert.rejects(
    () =>
      executeReadonlyScriptProbe(page, {
        source: `return { text: 'x'.repeat(25000) };`,
        timeoutMs: 100,
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_RESULT_TOO_LARGE');
      assert.match(error.message, /probe result exceeded/i);
      return true;
    }
  );
});

test('executeProbeTemplate returns a bounded document snapshot', async () => {
  const page = {
    async evaluate(fn, input) {
      globalThis.window = { location: { href: 'http://fixture.local/path' } };
      globalThis.location = globalThis.window.location;
      globalThis.document = {
        title: 'Fixture title',
        body: { innerText: 'Hello from the fixture page' },
      };
      try {
        return await fn(input);
      } finally {
        delete globalThis.window;
        delete globalThis.location;
        delete globalThis.document;
      }
    },
  };

  const result = await executeProbeTemplate(page, {
    template: 'document_snapshot',
    timeoutMs: 100,
  });

  assert.equal(result.title, 'Fixture title');
  assert.equal(result.url, 'http://fixture.local/path');
  assert.match(result.text, /fixture page/i);
  assert.equal(typeof result.textLength, 'number');
});

test('executeProbeTemplate returns a bounded selector snapshot', async () => {
  const nodes = [
    {
      tagName: 'BUTTON',
      id: 'save',
      innerText: 'Save',
      value: '',
      checked: false,
      disabled: false,
      getAttribute(name) {
        return name === 'aria-label' ? 'Save changes' : null;
      },
      getBoundingClientRect() {
        return { x: 10.2, y: 20.6, width: 120.4, height: 32.1 };
      },
    },
  ];

  const page = {
    async evaluate(fn, input) {
      globalThis.document = {
        querySelectorAll(selector) {
          return selector === 'button' ? nodes : [];
        },
      };
      try {
        return await fn(input);
      } finally {
        delete globalThis.document;
      }
    },
  };

  const result = await executeProbeTemplate(page, {
    template: 'selector_snapshot',
    selector: 'button',
    includeGeometry: true,
    timeoutMs: 100,
  });

  assert.equal(result.selector, 'button');
  assert.equal(result.count, 1);
  assert.equal(result.elements[0].id, 'save');
  assert.equal(result.elements[0].text, 'Save');
  assert.equal(result.elements[0].ariaLabel, 'Save changes');
  assert.deepEqual(result.elements[0].geometry, { x: 10, y: 21, width: 120, height: 32 });
});

test('validateReadonlyProbe rejects title writes', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'document.title = "Changed"; return document.title;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'document_write');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects click invocation', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'document.querySelector("#save")?.click(); return true;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'dom_event');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects storage writes', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'localStorage.setItem("key", "value"); return true;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'storage_write');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects bracket-notation fetch writes', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'window[\"fetch\"](\"/api/demo\"); return true;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'network_side_effect');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects bracket-notation HTML writes', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'document.body[\"innerHTML\"] = \"changed\"; return true;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'html_write');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects obvious unbounded loops', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'while (true) {}',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'potential_infinite_loop');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects optional-chaining fetch writes', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'globalThis.fetch?.("/api/demo"); return true;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'network_side_effect');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects optional-chaining history writes', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'history?.pushState({}, "", "/next"); return true;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'navigation_write');
      return true;
    }
  );
});

test('validateReadonlyProbe rejects optional-chaining storage writes', () => {
  assert.throws(
    () =>
      validateReadonlyProbe({
        template: 'readonly_script',
        source: 'sessionStorage?.setItem("k", "v"); return true;',
      }),
    (error) => {
      assert.equal(error.code, 'PROBE_READONLY_VIOLATION');
      assert.equal(error.details.reason, 'storage_write');
      return true;
    }
  );
});
