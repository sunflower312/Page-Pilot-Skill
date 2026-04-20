import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePlaywright } from '../../benchmarks/scenarios/_shared/scenario-tools.js';

test('validatePlaywright revalidates generated code snippets in an isolated session', async () => {
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
          };
        }

        throw new Error(`Unexpected validation session ${args.sessionId}`);
      }

      if (name === 'browser_validate_playwright_code') {
        if (args.sessionId === 'generated-session') {
          return {
            ok: true,
            finalUrl: 'https://example.com/after',
            finalTitle: 'After',
          };
        }

        throw new Error(`Unexpected generated-code validation session ${args.sessionId}`);
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
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright').length, 1);
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright')[0].args.sessionId, 'live-session');
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright_code').length, 1);
  assert.equal(toolCalls.filter((call) => call.name === 'browser_validate_playwright_code')[0].args.sessionId, 'generated-session');
  assert.equal(toolCalls.filter((call) => call.name === 'browser_generate_playwright')[0].args.includeImports, false);
  assert.equal(toolCalls.filter((call) => call.name === 'browser_generate_playwright')[0].args.includeTestWrapper, false);
});
