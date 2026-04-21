import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const integrationDir = fileURLToPath(new URL('.', import.meta.url));
const fixtureRoot = resolve(integrationDir, '..', 'fixtures');
const pluginRoot = resolve(integrationDir, '..', '..');

async function readPngSize(path) {
  const buffer = await readFile(path);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function startFixtureServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
      const target = requestPath === '/' ? '/structured-page.html' : requestPath;
      const filePath = join(fixtureRoot, target);
      try {
        const body = await readFile(filePath);
        const ext = extname(filePath);
        const contentType = ext === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
        res.writeHead(200, { 'content-type': contentType });
        res.end(body);
      } catch (error) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(String(error));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        close: () => new Promise((done) => server.close(done)),
        url: `http://127.0.0.1:${address.port}/structured-page.html`,
      });
    });
  });
}

function startInlineHtmlServer(routes, entryPath = '/') {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
      const body = routes[requestPath];
      if (!body) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`No fixture for ${requestPath}`);
        return;
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        close: () => new Promise((done) => server.close(done)),
        url: `http://127.0.0.1:${address.port}${entryPath}`,
      });
    });
  });
}

function createClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['scripts/mcp-server.js'],
    cwd: pluginRoot,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'page-pilot-skill-tests', version: '0.1.0' }, { capabilities: {} });
  return { client, transport };
}

test('mcp server lists browser tools over stdio', async () => {
  const { client, transport } = createClient();

  try {
    await client.connect(transport);
    const result = await client.listTools();
    const toolNames = result.tools.map((tool) => tool.name).sort();

    assert.deepEqual(toolNames, [
      'browser_capture_screenshot',
      'browser_close',
      'browser_generate_playwright',
      'browser_open',
      'browser_probe',
      'browser_rank_locators',
      'browser_repair_playwright',
      'browser_scan',
      'browser_snapshot_dom',
      'browser_validate_playwright',
    ]);
  } finally {
    await client.close();
  }
});

test('mcp browser_probe returns bounded template snapshots', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const documentProbe = await client.callTool({
      name: 'browser_probe',
      arguments: {
        sessionId,
        probe: {
          template: 'document_snapshot',
          timeoutMs: 1000,
        },
      },
    });

    assert.equal(documentProbe.structuredContent.ok, true);
    assert.equal(documentProbe.structuredContent.template, 'document_snapshot');
    assert.equal(documentProbe.structuredContent.data.title, 'Page Pilot Skill Fixture');
    assert.match(documentProbe.structuredContent.data.url, /\/structured-page\.html$/);
    assert.match(documentProbe.structuredContent.data.text, /Waiting for submit/);

    const selectorProbe = await client.callTool({
      name: 'browser_probe',
      arguments: {
        sessionId,
        probe: {
          template: 'selector_snapshot',
          selector: '#message',
          includeGeometry: true,
          timeoutMs: 1000,
        },
      },
    });

    assert.equal(selectorProbe.structuredContent.ok, true);
    assert.equal(selectorProbe.structuredContent.template, 'selector_snapshot');
    assert.equal(selectorProbe.structuredContent.data.count, 1);
    assert.equal(selectorProbe.structuredContent.data.elements[0].id, 'message');
    assert.equal(selectorProbe.structuredContent.data.elements[0].text, 'Waiting for submit');
    assert.equal(selectorProbe.structuredContent.data.elements[0].geometry.width > 0, true);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_probe still reports genuine probe failures', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const probeResult = await client.callTool({
      name: 'browser_probe',
      arguments: {
        sessionId,
        probe: {
          template: 'selector_snapshot',
          selector: '???',
          timeoutMs: 1000,
        },
      },
    });

    assert.equal(probeResult.structuredContent.ok, false);
    assert.equal(probeResult.structuredContent.error.code, 'BROWSER_PROBE_FAILED');
    assert.match(probeResult.structuredContent.error.message, /not a valid selector|selector/i);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_probe rejects internal-only templates from the public contract', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const probeResult = await client.callTool({
      name: 'browser_probe',
      arguments: {
        sessionId,
        probe: {
          template: 'readonly_script',
          source: `return document.title;`,
          timeoutMs: 1000,
        },
      },
    });

    assert.equal(probeResult.isError, true);
    assert.match(
      probeResult.content.find((entry) => entry.type === 'text')?.text ?? '',
      /invalid arguments|invalid input|readonly_script|template/i
    );

    const scanResult = await client.callTool({
      name: 'browser_scan',
      arguments: { sessionId, detailLevel: 'brief' },
    });
    assert.match(scanResult.structuredContent.url, /\/structured-page\.html$/);
    assert.match(scanResult.structuredContent.title, /Page Pilot Skill Fixture/);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_rank_locators sees specialized controls through the default semantic scan path', async () => {
  const inlineServer = await startInlineHtmlServer(
    {
      '/specialized': `
        <!doctype html>
        <html lang="en">
          <body>
            <main>
              <h1>Escalation panel</h1>
              <div role="switch" aria-checked="false" tabindex="0">Escalate case</div>
            </main>
          </body>
        </html>
      `,
    },
    '/specialized'
  );
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: inlineServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const ranking = await client.callTool({
      name: 'browser_rank_locators',
      arguments: {
        sessionId,
        target: {
          role: 'switch',
          accessibleName: 'Escalate case',
          visibleText: 'Escalate case',
        },
      },
    });

    assert.equal(ranking.structuredContent.ok, true);
    assert.equal(ranking.structuredContent.matches.length > 0, true);
    assert.equal(ranking.structuredContent.matches[0].element.role, 'switch');
    assert.equal(ranking.structuredContent.matches[0].locatorChoices[0].locator.strategy, 'role');

    const scan = await client.callTool({
      name: 'browser_scan',
      arguments: {
        sessionId,
        detailLevel: 'standard',
        includeSpecializedControls: true,
        verification: {
          enabled: true,
          groups: ['switches'],
          maxPerElement: 1,
        },
      },
    });

    assert.equal(scan.structuredContent.ok, true);
    assert.equal(scan.structuredContent.specializedControls.switches.length > 0, true);
    assert.equal(
      scan.structuredContent.specializedControls.switches[0].recommendedLocators[0].verification.attempted,
      true
    );

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await inlineServer.close();
  }
});

test('mcp browser_validate_playwright rejects unbounded validation sequences', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const steps = Array.from({ length: 13 }, () => ({ type: 'wait_for', value: 1 }));
    const validationResult = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps,
      },
    });

    assert.equal(validationResult.isError, true);
    assert.match(
      validationResult.content.find((entry) => entry.type === 'text')?.text ?? '',
      /too_big|too many|max|steps/i
    );

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser tools execute a full headless workflow and write artifacts', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        viewport: { width: 1280, height: 720 },
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;
    assert.equal(openResult.structuredContent.ok, true);
    assert.match(openResult.structuredContent.title, /Page Pilot Skill Fixture/);

    const scanResult = await client.callTool({
      name: 'browser_scan',
      arguments: { sessionId, detailLevel: 'standard' },
    });
    assert.match(scanResult.structuredContent.title, /Page Pilot Skill Fixture/);
    assert.equal(
      scanResult.structuredContent.interactives.inputs.find((entry) => entry.css === '#email').preferredLocator.strategy,
      'role'
    );

    const rankingResult = await client.callTool({
      name: 'browser_rank_locators',
      arguments: {
        sessionId,
        target: {
          role: 'textbox',
          accessibleName: 'Email',
        },
      },
    });
    assert.equal(rankingResult.structuredContent.ok, true);
    assert.equal(rankingResult.structuredContent.matches[0].preferredLocator.strategy, 'role');
    assert.equal(rankingResult.structuredContent.matches[0].element.accessibleName, 'Email');
    assert.equal(rankingResult.structuredContent.matches[0].matchCount, 1);
    assert.match(rankingResult.structuredContent.matches[0].playwrightExpression, /page\.getByRole/);
    assert.deepEqual(
      rankingResult.structuredContent.matches[0].locatorChoices.map((choice) => choice.locatorType),
      ['role', 'label', 'text', 'placeholder', 'css']
    );
    assert.equal(rankingResult.structuredContent.matches[0].locatorChoices[0].matchCount, 1);
    assert.match(rankingResult.structuredContent.matches[0].locatorChoices[0].playwrightExpression, /page\.getByRole/);
    assert.equal(
      rankingResult.structuredContent.matches[0].locatorChoices.at(-1).fallbackReason,
      'css_fallback'
    );

    const probeResult = await client.callTool({
      name: 'browser_probe',
      arguments: {
        sessionId,
        probe: {
          template: 'document_snapshot',
          timeoutMs: 1000,
        },
      },
    });
    assert.equal(probeResult.structuredContent.ok, true);
    assert.equal(probeResult.structuredContent.data.title, 'Page Pilot Skill Fixture');
    assert.match(probeResult.structuredContent.data.text, /Waiting for submit/);

    const serializedProbeResult = await client.callTool({
      name: 'browser_probe',
      arguments: {
        sessionId,
        probe: {
          template: 'selector_snapshot',
          selector: '#message',
          timeoutMs: 1000,
        },
      },
    });
    assert.equal(serializedProbeResult.structuredContent.ok, true);
    assert.equal(serializedProbeResult.structuredContent.data.count, 1);
    assert.equal(serializedProbeResult.structuredContent.data.elements[0].id, 'message');

    const actionsResult = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [
          { type: 'fill', locator: { strategy: 'placeholder', value: 'email@example.com' }, value: 'qa@example.com' },
          {
            type: 'click',
            locator: { strategy: 'text', value: 'Submit' },
            expectedStateChange: { kind: 'dom_change', textIncludes: 'Thanks qa@example.com' },
          },
          { type: 'wait_for', value: 50 },
          { type: 'capture', locator: { strategy: 'css', value: '#message' } },
          { type: 'assert_text', locator: { strategy: 'css', value: '#message' }, value: 'Thanks qa@example.com' },
          { type: 'assert_url', value: '/structured-page.html' },
        ],
      },
    });
    assert.equal(actionsResult.structuredContent.ok, true);
    await access(actionsResult.structuredContent.steps[3].path);
    const captureSize = await readPngSize(actionsResult.structuredContent.steps[3].path);
    assert.equal(captureSize.height < 200, true);
    assert.equal(actionsResult.structuredContent.steps[0].locatorChoice.strategy, 'role');
    assert.equal(actionsResult.structuredContent.steps[0].locatorRanking[0].preferredLocator.strategy, 'role');
    assert.equal(actionsResult.structuredContent.steps[0].verification.candidates[0].usable, true);
    assert.equal(actionsResult.structuredContent.steps[1].stability.settled, true);
    assert.equal(actionsResult.structuredContent.steps[1].stability.trigger !== 'url_change', true);
    assert.equal(actionsResult.structuredContent.observation.newText.includes('Thanks qa@example.com'), true);
    assert.equal(actionsResult.structuredContent.stateChanged, true);
    assert.equal(actionsResult.structuredContent.assertionsPassed, true);
    assert.equal(actionsResult.structuredContent.failureKind, null);
    assert.equal(actionsResult.structuredContent.evidence.steps[1].expectedStateChange.kind, 'dom_change');
    assert.equal(actionsResult.structuredContent.validation.metrics.semanticLocatorRatio >= 0.5, true);

    const generatedCodeResult = await client.callTool({
      name: 'browser_generate_playwright',
      arguments: { sessionId, testName: 'generated workflow' },
    });
    assert.equal(generatedCodeResult.structuredContent.ok, true);
    assert.match(generatedCodeResult.structuredContent.code, /test\('generated workflow'/);
    assert.match(generatedCodeResult.structuredContent.code, /page\.goto\(/);
    assert.match(
      generatedCodeResult.structuredContent.code,
      /await[\s\S]{0,200}?\.(?:fill|type|pressSequentially)\('qa@example\.com'\)/
    );
    assert.match(generatedCodeResult.structuredContent.code, /await[\s\S]{0,200}?(?:'|")Submit(?:'|")[\s\S]{0,120}?\.click\(\)/);
    assert.match(generatedCodeResult.structuredContent.code, /expect\.poll\(async \(\) => page\.url\(\)\)\.toContain/);
    assert.equal(generatedCodeResult.structuredContent.source.generatedFrom, 'validated_playwright_evidence');
    assert.equal(generatedCodeResult.structuredContent.locatorChoices[0].locator.strategy, 'role');
    assert.ok(Array.isArray(generatedCodeResult.structuredContent.generatedPlan));
    assert.equal(generatedCodeResult.structuredContent.expectedStateChanges[0].kind, 'dom_change');

    const failedActionsResult = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [{ type: 'click', locator: { strategy: 'text', value: 'Missing submit button' } }],
      },
    });
    assert.equal(failedActionsResult.structuredContent.ok, true);
    assert.equal(failedActionsResult.structuredContent.validation.passed, false);

    const expectedStateFailure = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [
          {
            type: 'click',
            locator: { strategy: 'text', value: 'Submit' },
            expectedStateChange: { kind: 'url_change' },
          },
        ],
      },
    });
    assert.equal(expectedStateFailure.structuredContent.ok, true);
    assert.equal(expectedStateFailure.structuredContent.validation.passed, false);
    assert.equal(expectedStateFailure.structuredContent.failureKind, 'EXPECTED_STATE_CHANGE_NOT_OBSERVED');
    assert.equal(expectedStateFailure.structuredContent.stateChanged, false);

    const expectedStateRepair = await client.callTool({
      name: 'browser_repair_playwright',
      arguments: {
        sessionId,
        steps: [
          {
            type: 'click',
            locator: { strategy: 'text', value: 'Submit' },
            expectedStateChange: { kind: 'url_change' },
          },
        ],
      },
    });
    assert.equal(expectedStateRepair.structuredContent.ok, true);
    assert.equal(expectedStateRepair.structuredContent.validation.passed, false);
    assert.equal(expectedStateRepair.structuredContent.repairAttempted, false);

    const failedAssertionResult = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [
          { type: 'assert_text', locator: { strategy: 'css', value: '#message' }, value: 'This text does not exist' },
        ],
      },
    });
    assert.equal(failedAssertionResult.structuredContent.ok, true);
    assert.equal(failedAssertionResult.structuredContent.validation.passed, false);
    assert.equal(failedAssertionResult.structuredContent.assertionsPassed, false);
    assert.equal(failedAssertionResult.structuredContent.evidence.steps[0].assertionPassed, false);

    const repairedActionsResult = await client.callTool({
      name: 'browser_repair_playwright',
      arguments: {
        sessionId,
        steps: [{ type: 'click', locator: { strategy: 'text', value: 'Missing submit button' } }],
      },
    });
    assert.equal(repairedActionsResult.structuredContent.ok, true);
    assert.equal(repairedActionsResult.structuredContent.repairAttempted, true);
    assert.equal(repairedActionsResult.structuredContent.revalidated, true);
    assert.equal(repairedActionsResult.structuredContent.validation.repaired, true);
    assert.equal(repairedActionsResult.structuredContent.repairStrategy, 'locator_reordered');
    assert.match(repairedActionsResult.structuredContent.repairedArtifacts.code, /Submit/);
    assert.equal(
      repairedActionsResult.structuredContent.repairedArtifacts.generatedPlan.find((step) => step.type === 'click').locator.strategy,
      'role'
    );
    assert.equal(repairedActionsResult.structuredContent.repairedArtifacts.locatorChoices[0].locator.strategy, 'role');
    assert.equal(repairedActionsResult.structuredContent.repairedArtifacts.source.generatedFrom, 'repair_validation_evidence');

    const preservedCodeResult = await client.callTool({
      name: 'browser_generate_playwright',
      arguments: { sessionId, testName: 'preserved workflow' },
    });
    assert.equal(preservedCodeResult.structuredContent.ok, true);
    assert.match(preservedCodeResult.structuredContent.code, /test\('preserved workflow'/);

    const screenshotResult = await client.callTool({
      name: 'browser_capture_screenshot',
      arguments: { sessionId, fullPage: true },
    });
    await access(screenshotResult.structuredContent.path);

    const domResult = await client.callTool({
      name: 'browser_snapshot_dom',
      arguments: { sessionId },
    });
    await access(domResult.structuredContent.path);

    const closeResult = await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
    assert.equal(closeResult.structuredContent.ok, true);

    const missingSessionScan = await client.callTool({
      name: 'browser_scan',
      arguments: { sessionId: 'missing-session', detailLevel: 'brief' },
    });
    assert.equal(missingSessionScan.structuredContent.ok, false);
    assert.equal(missingSessionScan.structuredContent.error.code, 'SESSION_NOT_FOUND');

    const missingSessionClose = await client.callTool({
      name: 'browser_close',
      arguments: { sessionId: 'missing-session' },
    });
    assert.equal(missingSessionClose.structuredContent.ok, false);
    assert.equal(missingSessionClose.structuredContent.error.code, 'SESSION_NOT_FOUND');
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_generate_playwright accumulates passed validation batches within one session', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const firstValidation = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [
          { type: 'fill', locator: { strategy: 'placeholder', value: 'email@example.com' }, value: 'qa@example.com' },
          { type: 'click', locator: { strategy: 'text', value: 'Submit' } },
        ],
      },
    });
    assert.equal(firstValidation.structuredContent.ok, true);

    const secondValidation = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [{ type: 'assert_text', locator: { strategy: 'css', value: '#message' }, value: 'Thanks qa@example.com' }],
      },
    });
    assert.equal(secondValidation.structuredContent.ok, true);

    const generated = await client.callTool({
      name: 'browser_generate_playwright',
      arguments: { sessionId, testName: 'multi batch workflow' },
    });

    assert.equal(generated.structuredContent.ok, true);
    assert.equal(generated.structuredContent.source.actionCount, 2);
    assert.equal(generated.structuredContent.source.assertionCount, 1);
    assert.doesNotMatch(generated.structuredContent.code, /createPagePilotRuntime/);
    assert.match(generated.structuredContent.code, /fill\('qa@example\.com'\)/);
    assert.equal(
      generated.structuredContent.generatedPlan.find((step) => step.type === 'fill')?.value,
      'qa@example.com'
    );
    assert.match(generated.structuredContent.code, /Submit/);
    assert.match(generated.structuredContent.code, /readAssertionText/);
    assert.equal(generated.structuredContent.generatedPlan.filter((step) => step.type === 'fill').length >= 1, true);
    assert.equal(generated.structuredContent.generatedPlan.filter((step) => step.type === 'assert_text').length, 1);

    const replaySession = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });

    const replayValidation = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId: replaySession.structuredContent.sessionId,
        steps: generated.structuredContent.generatedPlan,
      },
    });

    assert.equal(replayValidation.structuredContent.ok, true);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId: replaySession.structuredContent.sessionId },
    });

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_generate_playwright preserves earlier passed evidence after a later failed validation', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const firstValidation = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [{ type: 'click', locator: { strategy: 'text', value: 'Submit' } }],
      },
    });
    assert.equal(firstValidation.structuredContent.ok, true);

    const failedValidation = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [{ type: 'click', locator: { strategy: 'text', value: 'Missing submit button' } }],
      },
    });
    assert.equal(failedValidation.structuredContent.ok, true);
    assert.equal(failedValidation.structuredContent.validation.passed, false);

    const generated = await client.callTool({
      name: 'browser_generate_playwright',
      arguments: { sessionId, testName: 'stale-evidence' },
    });

    assert.equal(generated.structuredContent.ok, true);
    assert.match(generated.structuredContent.code, /Submit/);
    assert.equal(generated.structuredContent.generatedPlan.some((step) => step.type === 'click'), true);
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_validate_playwright accepts minObserveMs for stability configuration', async () => {
  const fixtureServer = await startFixtureServer();
  const { client, transport } = createClient();

  try {
    await client.connect(transport);

    const openResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        waitUntil: 'domcontentloaded',
        timeoutMs: 5000,
      },
    });
    const sessionId = openResult.structuredContent.sessionId;

    const result = await client.callTool({
      name: 'browser_validate_playwright',
      arguments: {
        sessionId,
        steps: [
          { type: 'fill', locator: { strategy: 'label', value: 'Email' }, value: 'qa@example.com' },
          {
            type: 'click',
            locator: { strategy: 'text', value: 'Submit' },
            stability: { settleMs: 120, minObserveMs: 1000, timeoutMs: 2500 },
          },
        ],
      },
    });

    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.steps[1].stability.settled, true);
    assert.equal(result.structuredContent.steps[1].stability.minObserveMs, 1000);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});
