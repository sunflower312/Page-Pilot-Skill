import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePlaywright, validatePlaywrightBatches } from '../../benchmarks/scenarios/_shared/scenario-tools.js';

test('validatePlaywright revalidates generated plans in an isolated session', async () => {
  const toolCalls = [];
  const opened = [];
  const closed = [];

  const context = {
    site: { id: 'fixture-site', baseUrl: 'https://example.com' },
    scenario: { id: 'fixture-scenario', entryUrl: 'https://example.com/start' },
    recordStep() {},
    async callTool(name, args = {}) {
      toolCalls.push({ name, args });

      if (name === 'browser_validate_playwright') {
        if (args.sessionId === 'live-session') {
          return {
            ok: true,
            source: { finalUrl: 'https://example.com/after', finalTitle: 'After' },
            observation: {},
            validation: {
              firstPass: true,
              repaired: false,
              metrics: {
                semanticLocatorRatio: 1,
                cssFallbackRatio: 0,
                uniqueLocatorHitRate: 1,
              },
            },
          };
        }

        if (args.sessionId === 'generated-session') {
          return {
            ok: true,
            validation: {
              metrics: {
                uniqueLocatorHitRate: 1,
                uniqueLocatorHitCount: 1,
              },
            },
          };
        }

        throw new Error(`Unexpected validation session ${args.sessionId}`);
      }

      if (name === 'browser_generate_playwright') {
        return {
          ok: true,
          code: 'test code',
          generatedPlan: [
            { type: 'navigate', url: 'https://example.com/start' },
            { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Next' } } },
          ],
          metrics: {
            semanticLocatorRatio: 1,
            cssFallbackRatio: 0,
            codeLineCount: 5,
          },
        };
      }

      throw new Error(`Unexpected tool ${name}`);
    },
    async openSession(options = {}) {
      opened.push(options);
      return {
        ok: true,
        sessionId: 'generated-session',
        url: options.url ?? 'https://example.com/start',
      };
    },
    async closeSession(sessionId) {
      closed.push(sessionId);
      return true;
    },
  };

  const result = await validatePlaywright(context, 'live-session', 'Validate generated code', [
    { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Next' } } },
  ]);

  assert.equal(result.ok, true);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, 'https://example.com/start');
  assert.deepEqual(closed, ['generated-session']);
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright').length, 2);
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright')[0].args.sessionId, 'live-session');
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright')[1].args.sessionId, 'generated-session');
  assert.deepEqual(
    toolCalls.filter((call) => call.name === 'browser_validate_playwright')[1].args.steps,
    [
      { type: 'navigate', url: 'https://example.com/start' },
      { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Next' } } },
    ]
  );
  assert.equal(toolCalls.filter((call) => call.name === 'browser_generate_playwright')[0].args.includeImports, false);
  assert.equal(toolCalls.filter((call) => call.name === 'browser_generate_playwright')[0].args.includeTestWrapper, false);
});

test('validatePlaywright can skip generated validation for intermediate benchmark batches', async () => {
  const toolCalls = [];

  const context = {
    site: { id: 'fixture-site', baseUrl: 'https://example.com' },
    scenario: { id: 'fixture-scenario', entryUrl: 'https://example.com/start' },
    recordStep() {},
    async callTool(name, args = {}) {
      toolCalls.push({ name, args });

      if (name === 'browser_validate_playwright') {
        return {
          ok: true,
          source: { finalUrl: 'https://example.com/after', finalTitle: 'After' },
          observation: {},
          validation: {
            firstPass: true,
            repaired: false,
            metrics: {
              semanticLocatorRatio: 1,
              cssFallbackRatio: 0,
              uniqueLocatorHitRate: 1,
            },
          },
        };
      }

      throw new Error(`Unexpected tool ${name}`);
    },
    async openSession() {
      throw new Error('Generated validation session should not open when skipping generated validation');
    },
    async closeSession() {
      throw new Error('Generated validation session should not close when skipping generated validation');
    },
  };

  const result = await validatePlaywright(
    context,
    'live-session',
    'Validate only the current batch',
    [{ type: 'wait_for', value: 50 }],
    { skipGeneratedValidation: true }
  );

  assert.equal(result.ok, true);
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright').length, 1);
  assert.equal(toolCalls.some((call) => call.name === 'browser_generate_playwright'), false);
  assert.equal(result.generatedValidation?.skipped, true);
});

test('validatePlaywrightBatches runs generated validation once against the cumulative generated plan from all passed batches', async () => {
  const toolCalls = [];
  const opened = [];
  const closed = [];
  let validationCallCount = 0;

  const firstBatch = [{ type: 'fill', locator: { strategy: 'label', value: 'First name' }, value: 'Ada' }];
  const secondBatch = [{ type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Submit' } } }];

  const context = {
    site: { id: 'fixture-site', baseUrl: 'https://example.com' },
    scenario: { id: 'fixture-scenario', entryUrl: 'https://example.com/start' },
    recordStep() {},
    async callTool(name, args = {}) {
      toolCalls.push({ name, args });

      if (name === 'browser_validate_playwright') {
        if (args.sessionId === 'generated-session') {
          return {
            ok: true,
            validation: {
              metrics: {
                uniqueLocatorHitRate: 1,
                uniqueLocatorHitCount: 2,
              },
            },
          };
        }

        validationCallCount += 1;
        return {
          ok: true,
          source: { finalUrl: `https://example.com/step-${validationCallCount}`, finalTitle: `Step ${validationCallCount}` },
          observation: {},
          validation: {
            firstPass: true,
            repaired: false,
            metrics: {
              semanticLocatorRatio: 1,
              cssFallbackRatio: 0,
              uniqueLocatorHitRate: 1,
            },
          },
        };
      }

      if (name === 'browser_generate_playwright') {
        return {
          ok: true,
          code: 'test code',
          generatedPlan: [...firstBatch, ...secondBatch],
          metrics: {
            locatorCount: 2,
            semanticLocatorRatio: 1,
            cssFallbackRatio: 0,
            codeLineCount: 7,
          },
        };
      }

      throw new Error(`Unexpected tool ${name}`);
    },
    async openSession(options = {}) {
      opened.push(options);
      return {
        ok: true,
        sessionId: 'generated-session',
        url: options.url ?? 'https://example.com/start',
      };
    },
    async closeSession(sessionId) {
      closed.push(sessionId);
      return true;
    },
  };

  await validatePlaywrightBatches(context, 'live-session', 'Validate long flow', [firstBatch, secondBatch]);

  const generatedValidationCalls = toolCalls.filter(
    (call) => call.name === 'browser_validate_playwright' && call.args.sessionId === 'generated-session'
  );

  assert.equal(opened.length, 1);
  assert.deepEqual(closed, ['generated-session']);
  assert.equal(generatedValidationCalls.length, 1);
  assert.deepEqual(generatedValidationCalls[0].args.steps, [...firstBatch, ...secondBatch]);
});
