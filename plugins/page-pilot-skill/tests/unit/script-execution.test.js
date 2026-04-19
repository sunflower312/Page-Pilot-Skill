import test from 'node:test';
import assert from 'node:assert/strict';

import { executeScript, serializeForTransport } from '../../scripts/lib/script-execution.js';

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

test('executeScript serializes non-plain return values inside page context', async () => {
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

  const result = await executeScript(
    page,
    `
      const element = { nodeType: 1, nodeName: 'BUTTON', tagName: 'BUTTON', id: 'save', textContent: 'Save changes' };
      const payload = { element, ref: document, current: window };
      payload.self = payload;
      return payload;
    `
  );

  assert.equal(result.element.$type, 'element');
  assert.equal(result.ref.$type, 'document');
  assert.equal(result.current.$type, 'window');
  assert.equal(result.self.$type, 'circular');
});

test('executeScript marks navigation-driven execution context destruction so callers can recover', async () => {
  const page = {
    async evaluate() {
      throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
    },
  };

  await assert.rejects(
    () => executeScript(page, 'window.location.assign("/next-page.html");'),
    (error) => {
      assert.equal(error.code, 'SCRIPT_EXECUTION_CONTEXT_DESTROYED');
      assert.match(error.message, /execution context was destroyed/i);
      assert.match(error.cause?.message ?? '', /most likely because of a navigation/i);
      return true;
    }
  );
});

test('executeScript does not mark script-thrown navigation-looking errors as navigation interruptions', async () => {
  const page = {
    async evaluate() {
      throw new Error('page.evaluate: Error: Execution context was destroyed, most likely because of a navigation');
    },
  };

  await assert.rejects(
    () => executeScript(page, 'throw new Error("Execution context was destroyed, most likely because of a navigation");'),
    (error) => {
      assert.equal(error.code, undefined);
      assert.match(error.message, /Error: Execution context was destroyed, most likely because of a navigation/);
      return true;
    }
  );
});

test('executeScript does not mark frame detached errors as navigation interruptions', async () => {
  const page = {
    async evaluate() {
      throw new Error('page.evaluate: Frame was detached');
    },
  };

  await assert.rejects(
    () => executeScript(page, 'throw new Error("Frame was detached");'),
    (error) => {
      assert.equal(error.code, undefined);
      assert.equal(error.message, 'page.evaluate: Frame was detached');
      return true;
    }
  );
});

test('executeScript does not mark missing-context errors as navigation interruptions', async () => {
  const page = {
    async evaluate() {
      throw new Error('page.evaluate: Cannot find context with specified id');
    },
  };

  await assert.rejects(
    () => executeScript(page, 'throw new Error("Cannot find context with specified id");'),
    (error) => {
      assert.equal(error.code, undefined);
      assert.equal(error.message, 'page.evaluate: Cannot find context with specified id');
      return true;
    }
  );
});

test('executeScript does not swallow genuine script failures', async () => {
  const page = {
    async evaluate() {
      throw new Error('Script exploded');
    },
  };

  await assert.rejects(
    () => executeScript(page, 'throw new Error("Script exploded");'),
    (error) => {
      assert.equal(error.code, undefined);
      assert.equal(error.message, 'Script exploded');
      return true;
    }
  );
});
