import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { benchmarkRunSucceeded, listBenchmarks, runBenchmarks } from './benchmark-runner.js';
import { BETA_BENCHMARK_REQUIREMENTS, buildCoverageMatrix } from './coverage-matrix.js';
import { resolveScenarioSourcePath } from './scenario-helpers.js';
import { siteRegistry } from '../registry/sites.js';

const pluginRoot = fileURLToPath(new URL('../..', import.meta.url));

function createFakeClient(log, options = {}) {
  let closeAttempt = 0;
  return {
    async connect() {
      log.push('connect');
    },
    async listTools() {
      return [
        'browser_close',
        'browser_generate_playwright',
        'browser_open',
        'browser_probe',
        'browser_rank_locators',
        'browser_repair_playwright',
        'browser_scan',
        'browser_validate_playwright',
      ];
    },
    async callTool(name, args) {
      log.push({ name, args });
      return { ok: true, name, args };
    },
    async openSession(openOptions) {
      log.push({ name: 'browser_open', args: openOptions });
      return { ok: true, sessionId: options.sessionId ?? 'session-1', url: openOptions.url, title: 'Fixture Page' };
    },
    async closeSession(sessionId) {
      log.push({ name: 'browser_close', args: { sessionId } });
      if (Array.isArray(options.closeSessionResults)) {
        const response =
          options.closeSessionResults[Math.min(closeAttempt, options.closeSessionResults.length - 1)] ?? { ok: true };
        closeAttempt += 1;
        return response;
      }

      closeAttempt += 1;
      return options.closeSessionResult ?? { ok: true };
    },
    async close() {
      log.push('close');
    },
  };
}

test('runBenchmarks executes only qualified scenarios and writes acceptance reports', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-'));
  const calls = [];
  const registry = [
    {
      id: 'qualified-site',
      name: 'Qualified Site',
      status: 'qualified',
      baseUrl: 'https://example.test/qualified',
      compliance: { reviewStatus: 'qualified', notes: [] },
      evidence: { sourceLinks: ['https://example.test/qualified'], notes: [] },
      scenarios: [
        {
          id: 'extract-qualified',
          title: 'Qualified extract',
          status: 'qualified',
          module: './demo/qualified.js',
          tags: ['smoke'],
          guide: {
            steps: ['Open page, keep the full sentence intact', 'Extract data'],
            expectedResult: 'Returns extracted fixture data.',
            failureModes: ['Fixture data missing, malformed, or empty.'],
          },
        },
      ],
    },
    {
      id: 'pending-site',
      name: 'Pending Site',
      status: 'pending',
      baseUrl: 'https://example.test/pending',
      compliance: { reviewStatus: 'pending', notes: [] },
      evidence: { sourceLinks: ['https://example.test/pending'], notes: [] },
      scenarios: [
        {
          id: 'pending-scenario',
          title: 'Pending scenario',
          status: 'pending',
          tags: ['pending'],
          guide: {
            steps: ['Keep manifest visible'],
            expectedResult: 'No default execution.',
            failureModes: ['Not implemented.'],
          },
        },
      ],
    },
    {
      id: 'excluded-site',
      name: 'Excluded Site',
      status: 'excluded',
      baseUrl: 'https://example.test/excluded',
      compliance: { reviewStatus: 'excluded', notes: [] },
      evidence: { sourceLinks: ['https://example.test/excluded'], notes: [] },
      scenarios: [
        {
          id: 'excluded-scenario',
          title: 'Excluded scenario',
          status: 'excluded',
          tags: ['excluded'],
          guide: {
            steps: ['Keep manifest visible'],
            expectedResult: 'No default execution.',
            failureModes: ['Excluded by scope.'],
          },
        },
      ],
    },
  ];

  const run = await runBenchmarks({
    registry,
    outputDir,
    clientFactory: async () => createFakeClient(calls),
    moduleLoader: async (moduleId) => {
      if (moduleId === './demo/qualified.js') {
        return {
          scenario: {
            async run(context) {
              await context.withSession({}, async (sessionId) => {
                await context.callTool('browser_scan', { sessionId, detailLevel: 'brief' });
              });
              return {
                summary: 'qualified scenario passed',
                details: { mode: 'qualified' },
              };
            },
          },
        };
      }

      throw new Error(`Unexpected module request: ${moduleId}`);
    },
  });

  const listed = listBenchmarks({ registry });
  assert.equal(listed.length, 3);
  assert.equal(listed[1].defaultRun, false);
  assert.equal(listed[2].scenarios[0].defaultRun, false);
  assert.deepEqual(listed[0].scenarios[0].guide.steps, ['Open page, keep the full sentence intact', 'Extract data']);
  assert.deepEqual(listed[0].scenarios[0].guide.failureModes, ['Fixture data missing, malformed, or empty.']);
  assert.match(listed[0].scenarios[0].executable.command, /--site qualified-site --scenario extract-qualified/);

  assert.equal(run.catalog.summary.siteCount, 3);
  assert.equal(run.summary.siteCount, 1);
  assert.equal(run.summary.selectedScenarioCount, 1);
  assert.equal(run.summary.executedScenarioCount, 1);
  assert.equal(run.summary.passed, 1);
  assert.equal(run.acceptance.ok, true);
  assert.equal(
    calls.some((entry) => entry && entry.name === 'browser_scan' && entry.args.detailLevel === 'brief'),
    true
  );

  const markdown = await readFile(run.reportPaths.markdown, 'utf8');
  const json = JSON.parse(await readFile(run.reportPaths.json, 'utf8'));

  assert.match(markdown, /## Registry Inventory/);
  assert.match(markdown, /### pending-site \(pending\)/);
  assert.match(markdown, /#### extract-qualified \(qualified\)/);
  assert.match(markdown, /## Acceptance/);
  assert.equal(json.acceptance.ok, true);
  assert.equal(json.catalog.summary.pendingSiteCount, 1);
  assert.equal(json.catalog.sites[0].scenarios[0].executable.command.includes('--site qualified-site'), true);
  assert.equal(json.catalog.sites[0].scenarios[0].executable.sourcePath, null);
  assert.equal(typeof json.results[0].executable.command, 'string');
  assert.equal(json.results[0].executable.sourcePath, null);
});

test('runBenchmarks skips missing modules without crashing when no client was created yet', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-missing-'));
  const run = await runBenchmarks({
    registry: [
      {
        id: 'qualified-site',
        name: 'Qualified Site',
        status: 'qualified',
        baseUrl: 'https://example.test/qualified',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/qualified'], notes: [] },
        scenarios: [
          {
            id: 'missing-module',
            title: 'Missing module',
            status: 'qualified',
            module: './missing/module.js',
            tags: ['smoke'],
            guide: {
              steps: ['Open page'],
              expectedResult: 'Pending implementation.',
              failureModes: ['Module missing.'],
            },
          },
        ],
      },
    ],
    outputDir,
    moduleLoader: async () => {
      throw Object.assign(new Error('Cannot find module ./missing/module.js'), {
        code: 'ERR_MODULE_NOT_FOUND',
      });
    },
  });

  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].status, 'skipped');
  assert.equal(run.results[0].reason.code, 'SCENARIO_MODULE_MISSING');
  assert.equal(run.acceptance.ok, false);
  assert.equal(run.acceptance.code, 'NO_SCENARIOS_EXECUTED');
});

test('runBenchmarks excludes unavailable external sites from acceptance and coverage denominators', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-unavailable-'));
  const calls = [];
  const run = await runBenchmarks({
    registry: [
      {
        id: 'up-site',
        name: 'Up Site',
        status: 'qualified',
        baseUrl: 'https://example.test/up',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/up'], notes: [] },
        scenarios: [
          {
            id: 'up-scenario',
            title: 'Up scenario',
            status: 'qualified',
            module: './demo/up.js',
            tags: ['smoke'],
            guide: { steps: ['Open page'], expectedResult: 'Passes.', failureModes: ['None.'] },
            metadata: { codeQualityEligible: true },
          },
        ],
      },
      {
        id: 'down-site',
        name: 'Down Site',
        status: 'qualified',
        baseUrl: 'https://example.test/down',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/down'], notes: [] },
        scenarios: [
          {
            id: 'down-scenario',
            title: 'Down scenario',
            status: 'qualified',
            module: './demo/down.js',
            tags: ['smoke'],
            guide: { steps: ['Open page'], expectedResult: 'Skipped when site is unavailable.', failureModes: ['External site down.'] },
            metadata: { codeQualityEligible: true },
          },
        ],
      },
    ],
    outputDir,
    clientFactory: async () => ({
      async connect() {
        calls.push('connect');
      },
      async listTools() {
        return ['browser_open', 'browser_close'];
      },
      async openSession(options) {
        calls.push({ name: 'browser_open', args: options });
        if (String(options.url).includes('/down')) {
          return { ok: true, sessionId: 'down-session', url: options.url, title: 'Application Error' };
        }
        return { ok: true, sessionId: 'up-session', url: options.url, title: 'Ready' };
      },
      async closeSession(sessionId) {
        calls.push({ name: 'browser_close', args: { sessionId } });
        return { ok: true };
      },
      async callTool(name, args) {
        calls.push({ name, args });
        return { ok: true };
      },
      async close() {
        calls.push('close');
      },
    }),
    moduleLoader: async (moduleId) => {
      if (moduleId === './demo/up.js') {
        return {
          scenario: {
            async run(context) {
              await context.withSession({}, async () => {});
              context.recordStep('Synthetic validation', 'passed', {
                codeQuality: {
                  semanticLocatorRatio: 1,
                  cssFallbackRatio: 0,
                  uniqueLocatorHitRate: 1,
                  firstValidationPassed: true,
                  generatedValidationPassed: true,
                  repaired: false,
                  codeLineCount: 5,
                },
              });
              return { summary: 'up passed' };
            },
          },
        };
      }
      if (moduleId === './demo/down.js') {
        return {
          scenario: {
            async run(context) {
              await context.withSession({}, async () => {});
              return { summary: 'should not reach here' };
            },
          },
        };
      }
      throw new Error(`Unexpected module request: ${moduleId}`);
    },
  });

  assert.equal(run.summary.passed, 1);
  assert.equal(run.summary.skipped, 1);
  assert.equal(run.summary.externalUnavailableSkipped, 1);
  assert.equal(run.acceptance.ok, true);
  assert.equal(run.coverage.summary.externalUnavailableSkipped, 1);
  assert.equal(run.coverage.codeQuality.scenarioCount, 1);
});

test('buildCoverageMatrix skips code-quality ratio gates when every eligible scenario is externally unavailable', () => {
  const coverage = buildCoverageMatrix(
    [
      {
        id: 'offline-site',
        name: 'Offline Site',
        status: 'qualified',
        baseUrl: 'https://example.test/offline',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/offline'], notes: [] },
        scenarios: [
          {
            id: 'offline-scenario',
            title: 'Offline scenario',
            status: 'qualified',
            module: './demo/offline.js',
            tags: ['smoke'],
            guide: { steps: ['Open page'], expectedResult: 'Would pass if available.', failureModes: ['Site unavailable.'] },
            metadata: { codeQualityEligible: true },
          },
        ],
      },
    ],
    [
      {
        siteId: 'offline-site',
        scenarioId: 'offline-scenario',
        status: 'skipped',
        reason: { code: 'EXTERNAL_SITE_UNAVAILABLE', message: 'Site unavailable.' },
      },
    ]
  );

  assert.equal(coverage.summary.codeQualityEligibleScenarioCount, 1);
  assert.equal(coverage.summary.codeQualityExternalUnavailableSkipped, 1);
  assert.equal(coverage.codeQuality.scenarioCount, 0);
  assert.equal(
    coverage.betaGate.failures.some((failure) => /semantic locator ratio|css fallback ratio|unique locator hit rate|first validation pass rate|generated validation pass rate/.test(failure)),
    false,
    coverage.betaGate.failures.join('; ')
  );
});

test('runBenchmarks keeps tool-level internal error pages as failures unless a scenario explicitly reclassifies them', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-tool-unavailable-'));
  const run = await runBenchmarks({
    registry: [
      {
        id: 'tool-down-site',
        name: 'Tool Down Site',
        status: 'qualified',
        baseUrl: 'https://example.test/tool-down',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/tool-down'], notes: [] },
        scenarios: [
          {
            id: 'tool-down-scenario',
            title: 'Tool down scenario',
            status: 'qualified',
            module: './demo/tool-down.js',
            tags: ['smoke'],
            guide: {
              steps: ['Open session', 'Run validation'],
              expectedResult: 'Fails because the scenario did not explicitly reclassify the tool failure.',
              failureModes: ['Tool returned an internal error page response.'],
            },
          },
        ],
      },
    ],
    outputDir,
    clientFactory: async () => ({
      async connect() {},
      async listTools() {
        return ['browser_open', 'browser_close', 'browser_validate_playwright'];
      },
      async openSession(options) {
        return { ok: true, sessionId: 'tool-down-session', url: options.url, title: 'Ready' };
      },
      async closeSession() {
        return { ok: true };
      },
      async callTool(name) {
        if (name === 'browser_validate_playwright') {
          return {
            ok: false,
            source: {
              finalUrl: 'https://example.test/tool-down/openaccount',
              finalTitle: 'Tool Down | Open Account',
            },
            observation: {
              newText: ['Error! An internal error has occurred and has been logged.'],
            },
            error: {
              code: 'ACTION_STEP_FAILED',
              message: 'Error! An internal error has occurred and has been logged.',
            },
          };
        }
        return { ok: true };
      },
      async close() {},
    }),
    moduleLoader: async () => ({
      scenario: {
        async run(context) {
          await context.withSession({}, async (sessionId) => {
            await context.callTool('browser_validate_playwright', { sessionId, steps: [] });
          });
          return { summary: 'should not reach here' };
        },
      },
    }),
  });

  assert.equal(run.summary.failed, 1);
  assert.equal(run.summary.externalUnavailableSkipped, 0);
  assert.equal(run.acceptance.ok, false);
  assert.equal(run.results[0].status, 'failed');
  assert.equal(run.results[0].reason.code, 'BENCHMARK_TOOL_FAILED');
  assert.equal(run.coverage.summary.externalUnavailableSkipped, 0);
});

test('runBenchmarks fails the scenario when browser_close reports an application-level failure', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-close-'));
  const calls = [];
  const run = await runBenchmarks({
    registry: [
      {
        id: 'qualified-site',
        name: 'Qualified Site',
        status: 'qualified',
        baseUrl: 'https://example.test/qualified',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/qualified'], notes: [] },
        scenarios: [
          {
            id: 'close-contract',
            title: 'Close contract',
            status: 'qualified',
            module: './demo/close-contract.js',
            tags: ['smoke'],
            guide: {
              steps: ['Open session', 'Close session'],
              expectedResult: 'Close contract failure should fail the benchmark.',
              failureModes: ['browser_close reports ok: false.'],
            },
          },
        ],
      },
    ],
    outputDir,
    clientFactory: async () =>
      createFakeClient(calls, {
        closeSessionResults: [
          {
            ok: false,
            error: { code: 'BROWSER_CLOSE_FAILED', message: 'Close failed' },
          },
          { ok: true },
        ],
      }),
    moduleLoader: async () => ({
      scenario: {
        async run(context) {
          await context.withSession({}, async () => {});
          return {
            summary: 'should not remain passed',
          };
        },
      },
    }),
  });

  assert.equal(run.results[0].status, 'failed');
  assert.equal(run.results[0].reason.code, 'BENCHMARK_TOOL_FAILED');
  assert.equal(run.results[0].error.details.toolName, 'browser_close');
  assert.equal(run.acceptance.ok, false);
  assert.equal(calls.filter((entry) => entry && entry.name === 'browser_close').length, 2);
  assert.equal(run.acceptance.code, 'NO_SCENARIOS_PASSED');
});

test('runBenchmarks counts a started scenario as executed even when the scenario throws', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-thrown-'));
  const run = await runBenchmarks({
    registry: [
      {
        id: 'qualified-site',
        name: 'Qualified Site',
        status: 'qualified',
        baseUrl: 'https://example.test/qualified',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/qualified'], notes: [] },
        scenarios: [
          {
            id: 'throws-after-start',
            title: 'Throws after start',
            status: 'qualified',
            module: './demo/throws-after-start.js',
            tags: ['smoke'],
            guide: {
              steps: ['Start scenario', 'Throw an execution error'],
              expectedResult: 'Started scenario should still count as executed.',
              failureModes: ['Scenario throws after execution begins.'],
            },
          },
        ],
      },
    ],
    outputDir,
    clientFactory: async () => createFakeClient([]),
    moduleLoader: async () => ({
      scenario: {
        async run() {
          throw Object.assign(new Error('Scenario exploded after starting'), {
            code: 'SCENARIO_BROKEN',
          });
        },
      },
    }),
  });

  assert.equal(run.results[0].status, 'failed');
  assert.equal(run.results[0].executed, true);
  assert.equal(run.summary.executedScenarioCount, 1);
  assert.equal(run.acceptance.ok, false);
  assert.equal(run.acceptance.code, 'NO_SCENARIOS_PASSED');
});

test('listBenchmarks rejects unknown manifest statuses instead of treating them as qualified', () => {
  assert.throws(
    () =>
      listBenchmarks({
        registry: [
          {
            id: 'typo-site',
            name: 'Typo Site',
            status: 'qualfied',
            baseUrl: 'https://example.test/typo',
            compliance: { reviewStatus: 'pending', notes: [] },
            evidence: { sourceLinks: ['https://example.test/typo'], notes: [] },
            scenarios: [],
          },
        ],
      }),
    (error) => {
      assert.equal(error.code, 'BENCHMARK_INVALID_STATUS');
      assert.equal(error.details.status, 'qualfied');
      return true;
    }
  );
});

test('real-site registry includes the full qualified benchmark inventory', () => {
  const listed = listBenchmarks({ registry: siteRegistry });
  const byId = new Map(listed.map((site) => [site.id, site]));
  const expectedSiteIds = [
    'toscrape',
    'scrape-this-site',
    'web-scraper-test-sites',
    'tryscrapeme',
    'the-internet',
    'ui-testing-playground',
    'expand-testing',
    'qa-playground',
    'rpa-challenge',
    'demoqa',
    'parabank',
  ];

  assert.deepEqual(
    [...byId.keys()].sort(),
    [...expectedSiteIds].sort()
  );

  for (const siteId of expectedSiteIds) {
    assert.ok(byId.has(siteId), `Missing site registry entry for ${siteId}`);
    assert.equal(byId.get(siteId).status, 'qualified', `${siteId} should be qualified`);
    assert.equal(byId.get(siteId).defaultRun, true, `${siteId} should default to runnable inventory`);
  }

  assert.equal(byId.get('the-internet').status, 'qualified');
  assert.equal(byId.get('parabank').status, 'qualified');
});

test('real-site registry keeps strong scenario coverage and only excludes pending scenarios from defaultRun', () => {
  const listed = listBenchmarks({ registry: siteRegistry });
  const minimumScenarioCounts = new Map([
    ['rpa-challenge', 1],
    ['toscrape', 4],
    ['scrape-this-site', 4],
    ['web-scraper-test-sites', 5],
    ['tryscrapeme', 4],
    ['the-internet', 7],
    ['ui-testing-playground', 6],
    ['expand-testing', 6],
    ['qa-playground', 5],
    ['demoqa', 4],
    ['parabank', 3],
  ]);

  for (const site of listed) {
    assert.ok(
      site.scenarios.length >= minimumScenarioCounts.get(site.id),
      `${site.id} should expose at least ${minimumScenarioCounts.get(site.id)} scenarios`
    );

    const pendingScenarios = site.scenarios.filter((scenario) => scenario.status !== 'qualified');
    for (const scenario of site.scenarios) {
      assert.equal(
        scenario.defaultRun,
        site.defaultRun && scenario.status === 'qualified',
        `${site.id}:${scenario.id} defaultRun should depend on qualified status`
      );
    }

    if (site.id === 'parabank') {
      assert.equal(pendingScenarios.length, 1);
      assert.equal(pendingScenarios[0].id, 'bill-pay');
      assert.equal(pendingScenarios[0].defaultRun, false);
      continue;
    }

    assert.equal(pendingScenarios.length, 0, `${site.id} should not retain pending scenarios`);
  }
});

test('real-site registry keeps qualified scenarios executable and documented', () => {
  const listed = listBenchmarks({ registry: siteRegistry });

  for (const site of listed) {
    for (const scenario of site.scenarios) {
      if (scenario.status !== 'qualified') {
        continue;
      }

      assert.ok(typeof scenario.executable?.command === 'string' && scenario.executable.command.length > 0);
      assert.ok(Array.isArray(scenario.guide?.steps) && scenario.guide.steps.length > 0);
      assert.ok(typeof scenario.guide?.expectedResult === 'string' && scenario.guide.expectedResult.length > 0);
    }
  }
});

test('real-site registry satisfies beta benchmark coverage requirements', () => {
  const coverageBaseline = buildCoverageMatrix(siteRegistry, []);
  assert.equal(coverageBaseline.summary.codeQualityEligibleScenarioCount, 22);
  const isCodeQualityEligible = (site, scenario) => {
    if (typeof scenario.metadata?.codeQualityEligible === 'boolean') {
      return scenario.metadata.codeQualityEligible;
    }

    const sourcePath = resolveScenarioSourcePath(site, scenario);
    if (!sourcePath) {
      return false;
    }

    try {
      return /\bvalidatePlaywright\s*\(/.test(readFileSync(sourcePath, 'utf8'));
    } catch {
      return false;
    }
  };
  const fakeQualityResults = siteRegistry.flatMap((site) =>
    site.scenarios
      .filter((scenario) => site.status === 'qualified' && scenario.status === 'qualified')
      .filter((scenario) => isCodeQualityEligible(site, scenario))
      .map((scenario) => ({
        siteId: site.id,
        scenarioId: scenario.id,
        metrics: {
          codeQuality: {
            locatorCount: 10,
            semanticLocatorCount: 9,
            cssFallbackCount: 1,
            uniqueLocatorHitCount: 9,
            semanticLocatorRatio: 0.9,
            cssFallbackRatio: 0.1,
            uniqueLocatorHitRate: 0.95,
            firstValidationPassed: true,
            generatedValidationPassed: true,
            repaired: false,
            codeLineCount: 24,
          },
        },
      }))
  );
  const coverage = buildCoverageMatrix(siteRegistry, fakeQualityResults);

  assert.equal(coverage.summary.qualifiedSiteCount, BETA_BENCHMARK_REQUIREMENTS.qualifiedSiteCount);
  assert.ok(
    coverage.summary.qualifiedScenarioCount >= BETA_BENCHMARK_REQUIREMENTS.minimumQualifiedScenarioCount,
    `qualified scenario count should reach beta threshold ${BETA_BENCHMARK_REQUIREMENTS.minimumQualifiedScenarioCount}`
  );
  assert.equal(coverage.summary.codeQualityEligibleScenarioCount, fakeQualityResults.length);
  assert.equal(coverage.betaGate.ok, true, coverage.betaGate.failures.join('; '));
  assert.ok(coverage.codeQuality.semanticLocatorRatio >= BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumSemanticLocatorRatio);
  assert.ok(coverage.codeQuality.cssFallbackRatio <= BETA_BENCHMARK_REQUIREMENTS.codeQuality.maximumCssFallbackRatio);
});

test('benchmarkRunSucceeded requires both acceptance and beta gate success', () => {
  assert.equal(
    benchmarkRunSucceeded({
      acceptance: { ok: true },
      coverage: { betaGate: { ok: true } },
    }),
    true
  );
  assert.equal(
    benchmarkRunSucceeded({
      acceptance: { ok: true },
      coverage: { betaGate: { ok: false } },
    }),
    false
  );
  assert.equal(
    benchmarkRunSucceeded({
      acceptance: { ok: false },
      coverage: { betaGate: { ok: true } },
    }),
    false
  );
});

test('runBenchmarks preserves the primary scenario failure when withSession cleanup fails first', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-primary-cleanup-'));
  const calls = [];
  const run = await runBenchmarks({
    registry: [
      {
        id: 'qualified-site',
        name: 'Qualified Site',
        status: 'qualified',
        baseUrl: 'https://example.test/qualified',
        compliance: { reviewStatus: 'qualified', notes: [] },
        evidence: { sourceLinks: ['https://example.test/qualified'], notes: [] },
        scenarios: [
          {
            id: 'primary-with-cleanup-failure',
            title: 'Primary failure with cleanup failure',
            status: 'qualified',
            module: './demo/primary-with-cleanup-failure.js',
            tags: ['smoke'],
            guide: {
              steps: ['Open session', 'Throw a scenario error', 'Retry session cleanup in the runner finally block'],
              expectedResult: 'The scenario error remains primary even if the first browser_close call fails.',
              failureModes: ['browser_close fails during withSession cleanup and masks the scenario error.'],
            },
          },
        ],
      },
    ],
    outputDir,
    clientFactory: async () =>
      createFakeClient(calls, {
        closeSessionResults: [
          {
            ok: false,
            error: { code: 'BROWSER_CLOSE_FAILED', message: 'Close failed on first attempt' },
          },
          { ok: true },
        ],
      }),
    moduleLoader: async () => ({
      scenario: {
        async run(context) {
          await context.withSession({}, async () => {
            throw Object.assign(new Error('Primary scenario failure'), {
              code: 'SCENARIO_PRIMARY_FAILURE',
            });
          });
        },
      },
    }),
  });

  assert.equal(run.results[0].status, 'failed');
  assert.equal(run.results[0].reason.code, 'SCENARIO_PRIMARY_FAILURE');
  assert.equal(run.results[0].error.message, 'Primary scenario failure');
  assert.equal(run.results[0].error.details.cleanupErrors.length, 1);
  assert.equal(run.results[0].error.details.cleanupErrors[0].code, 'BENCHMARK_TOOL_FAILED');
  assert.equal(run.results[0].error.details.cleanupErrors[0].details.toolName, 'browser_close');
  assert.equal(calls.filter((entry) => entry && entry.name === 'browser_close').length, 2);
  assert.equal(run.acceptance.ok, false);
  assert.equal(run.acceptance.code, 'NO_SCENARIOS_PASSED');
});

test('benchmark CLI exits non-zero when filters only match non-runnable registry entries', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'agent-browser-benchmarks-cli-'));
  const result = spawnSync(
    'node',
    ['scripts/run-benchmarks.js', '--site', 'parabank', '--scenario', 'bill-pay', '--format', 'json', '--output-dir', outputDir],
    {
      cwd: pluginRoot,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Acceptance: failed \(NO_SCENARIOS_AVAILABLE\)/);
});
