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
      'browser_execute_js',
      'browser_explore_goal',
      'browser_generate_playwright',
      'browser_open',
      'browser_run_actions',
      'browser_save_storage_state',
      'browser_scan',
      'browser_site_profile',
      'browser_snapshot_dom',
      'browser_strategy_report',
    ]);
  } finally {
    await client.close();
  }
});

test('mcp browser_execute_js recovers when navigation destroys the execution context after the script already triggered a transition', async () => {
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

    const jsResult = await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          window.location.assign('/next-page.html');
          await new Promise(() => {});
        `,
      },
    });

    assert.equal(jsResult.structuredContent.ok, true);
    assert.equal(jsResult.structuredContent.data, null);
    assert.equal(jsResult.structuredContent.observation.urlChanged, true);
    assert.equal(jsResult.structuredContent.observation.documentChanged, true);
    assert.equal(jsResult.structuredContent.observation.titleChanged, true);
    assert.equal(jsResult.structuredContent.observation.newText.includes('Navigation success.'), true);

    const scanResult = await client.callTool({
      name: 'browser_scan',
      arguments: { sessionId, detailLevel: 'brief' },
    });
    assert.match(scanResult.structuredContent.url, /\/next-page\.html$/);
    assert.match(scanResult.structuredContent.title, /Second Fixture Page/);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_execute_js still reports genuine script errors as failures', async () => {
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

    const jsResult = await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          throw new Error('Script exploded');
        `,
      },
    });

    assert.equal(jsResult.structuredContent.ok, false);
    assert.equal(jsResult.structuredContent.error.code, 'BROWSER_EXECUTE_JS_FAILED');
    assert.match(jsResult.structuredContent.error.message, /Script exploded/);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_execute_js fails when a navigation-looking context-loss error occurs without a main-document switch', async () => {
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

    const jsResult = await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          document.title = 'Transient title only';
          const banner = document.createElement('p');
          banner.textContent = 'Title-only mutation';
          document.body.appendChild(banner);
          throw new Error('Execution context was destroyed, most likely because of a navigation');
        `,
      },
    });

    assert.equal(jsResult.structuredContent.ok, false);
    assert.equal(jsResult.structuredContent.error.code, 'BROWSER_EXECUTE_JS_FAILED');
    assert.match(jsResult.structuredContent.error.message, /Execution context was destroyed, most likely because of a navigation/);

    const scanResult = await client.callTool({
      name: 'browser_scan',
      arguments: { sessionId, detailLevel: 'brief' },
    });
    assert.match(scanResult.structuredContent.url, /\/structured-page\.html$/);
    assert.match(scanResult.structuredContent.title, /Transient title only/);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_execute_js does not recover frame detached errors even if the page title changes', async () => {
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

    const jsResult = await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          document.title = 'Frame detached title';
          throw new Error('Frame was detached');
        `,
      },
    });

    assert.equal(jsResult.structuredContent.ok, false);
    assert.equal(jsResult.structuredContent.error.code, 'BROWSER_EXECUTE_JS_FAILED');
    assert.match(jsResult.structuredContent.error.message, /Frame was detached/);

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_execute_js does not recover missing-context errors even if the page DOM changes', async () => {
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

    const jsResult = await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          const banner = document.createElement('p');
          banner.textContent = 'Context missing banner';
          document.body.appendChild(banner);
          throw new Error('Cannot find context with specified id');
        `,
      },
    });

    assert.equal(jsResult.structuredContent.ok, false);
    assert.equal(jsResult.structuredContent.error.code, 'BROWSER_EXECUTE_JS_FAILED');
    assert.match(jsResult.structuredContent.error.message, /Cannot find context with specified id/);

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
    assert.match(openResult.structuredContent.title, /Agent Browser Fixture/);

    const scanResult = await client.callTool({
      name: 'browser_scan',
      arguments: { sessionId, detailLevel: 'standard' },
    });
    assert.match(scanResult.structuredContent.title, /Agent Browser Fixture/);
    assert.equal(
      scanResult.structuredContent.interactives.inputs.find((entry) => entry.css === '#email').preferredLocator.strategy,
      'role'
    );

    const initialStrategyResult = await client.callTool({
      name: 'browser_strategy_report',
      arguments: {
        sessionId,
        goal: '填写表单，提交，然后验证页面反馈',
      },
    });
    assert.equal(initialStrategyResult.structuredContent.ok, true);
    assert.equal(initialStrategyResult.structuredContent.state.pageType, 'form');
    assert.equal(
      initialStrategyResult.structuredContent.taskPlan.some((phase) => phase.id === 'complete_primary_work'),
      true
    );
    assert.equal(initialStrategyResult.structuredContent.nextActions.length > 0, true);

    const jsResult = await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          document.title = 'Agent Browser Fixture Updated';
          const banner = document.createElement('p');
          banner.textContent = 'Transient success banner';
          document.body.appendChild(banner);
          history.replaceState({}, '', '/structured-page.html?changed=1');
          return { title: document.title, banner: banner.textContent };
        `,
      },
    });
    assert.equal(jsResult.structuredContent.data.title, 'Agent Browser Fixture Updated');
    assert.equal(jsResult.structuredContent.observation.urlChanged, true);
    assert.equal(jsResult.structuredContent.observation.titleChanged, true);
    assert.equal(jsResult.structuredContent.observation.newText.includes('Transient success banner'), true);

    const serializedJsResult = await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          const element = document.querySelector('#message');
          const payload = { element };
          payload.self = payload;
          return payload;
        `,
      },
    });
    assert.equal(serializedJsResult.structuredContent.ok, true);
    assert.equal(serializedJsResult.structuredContent.data.element.$type, 'element');
    assert.equal(serializedJsResult.structuredContent.data.element.id, 'message');
    assert.equal(serializedJsResult.structuredContent.data.self.$type, 'circular');

    const actionsResult = await client.callTool({
      name: 'browser_run_actions',
      arguments: {
        sessionId,
        actions: [
          { type: 'fill', locator: { strategy: 'placeholder', value: 'email@example.com' }, value: 'qa@example.com' },
          { type: 'click', locator: { strategy: 'text', value: 'Submit' } },
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
    assert.equal(actionsResult.structuredContent.steps[0].locator.strategy, 'placeholder');
    assert.equal(actionsResult.structuredContent.steps[0].verification.candidates[0].usable, true);
    assert.equal(actionsResult.structuredContent.steps[1].stability.settled, true);
    assert.equal(actionsResult.structuredContent.steps[1].stability.trigger !== 'url_change', true);
    assert.equal(actionsResult.structuredContent.observation.newText.includes('Thanks qa@example.com'), true);

    const learnedStrategyResult = await client.callTool({
      name: 'browser_strategy_report',
      arguments: {
        sessionId,
        goal: '继续总结站点操作流程，并给出稳定的后续建议',
      },
    });
    assert.equal(learnedStrategyResult.structuredContent.ok, true);
    assert.equal(learnedStrategyResult.structuredContent.learnedExperience.knownStateCount >= 1, true);
    assert.equal(learnedStrategyResult.structuredContent.learnedExperience.stableLocators.length > 0, true);
    assert.equal(learnedStrategyResult.structuredContent.workflowSummary.phases.length > 0, true);
    assert.equal(
      learnedStrategyResult.structuredContent.workflowSummary.phases.some((phase) => phase.id === 'complete_form'),
      true
    );

    const generatedCodeResult = await client.callTool({
      name: 'browser_generate_playwright',
      arguments: { sessionId, testName: 'generated workflow' },
    });
    assert.equal(generatedCodeResult.structuredContent.ok, true);
    assert.match(generatedCodeResult.structuredContent.code, /test\('generated workflow'/);
    assert.match(generatedCodeResult.structuredContent.code, /page\.goto\(/);
    assert.match(
      generatedCodeResult.structuredContent.code,
      /await[\s\S]{0,200}?\.(?:fill|type|pressSequentially)\((?:'|")qa@example\.com(?:'|")\)/
    );
    assert.match(generatedCodeResult.structuredContent.code, /await[\s\S]{0,200}?(?:'|")Submit(?:'|")[\s\S]{0,120}?\.click\(\)/);
    assert.match(generatedCodeResult.structuredContent.code, /disabledCount:/);
    assert.match(generatedCodeResult.structuredContent.code, /expect\(page\)\.toHaveURL/);

    const failedActionsResult = await client.callTool({
      name: 'browser_run_actions',
      arguments: {
        sessionId,
        actions: [{ type: 'click', locator: { strategy: 'text', value: 'Missing submit button' } }],
      },
    });
    assert.equal(failedActionsResult.structuredContent.ok, false);

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

    const storageResult = await client.callTool({
      name: 'browser_save_storage_state',
      arguments: { sessionId },
    });
    await access(storageResult.structuredContent.path);

    await client.callTool({
      name: 'browser_execute_js',
      arguments: {
        sessionId,
        script: `
          localStorage.setItem('restored-key', 'restored-value');
          return localStorage.getItem('restored-key');
        `,
      },
    });

    const refreshedStorageResult = await client.callTool({
      name: 'browser_save_storage_state',
      arguments: { sessionId },
    });
    await access(refreshedStorageResult.structuredContent.path);

    const closeResult = await client.callTool({
      name: 'browser_close',
      arguments: { sessionId },
    });
    assert.equal(closeResult.structuredContent.ok, true);

    const reopenedResult = await client.callTool({
      name: 'browser_open',
      arguments: {
        url: fixtureServer.url,
        storageStatePath: refreshedStorageResult.structuredContent.path,
        waitUntil: 'domcontentloaded',
      },
    });
    const reopenedSessionId = reopenedResult.structuredContent.sessionId;

    const restoredValue = await client.callTool({
      name: 'browser_execute_js',
      arguments: { sessionId: reopenedSessionId, script: 'return localStorage.getItem("restored-key");' },
    });
    assert.equal(restoredValue.structuredContent.data, 'restored-value');

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

    await client.callTool({
      name: 'browser_close',
      arguments: { sessionId: reopenedSessionId },
    });
  } finally {
    await client.close();
    await fixtureServer.close();
  }
});

test('mcp browser_run_actions accepts minObserveMs for stability configuration', async () => {
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
      name: 'browser_run_actions',
      arguments: {
        sessionId,
        actions: [
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
