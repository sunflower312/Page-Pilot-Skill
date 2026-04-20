import { createBenchmarkClient } from './benchmark-client.js';
import { buildCoverageMatrix } from './coverage-matrix.js';
import { writeBenchmarkReports } from './report-writer.js';
import {
  buildEmptySummary,
  createReason,
  createStepRecorder,
  evaluateAcceptance,
  defineSiteManifest,
  isQualifiedStatus,
  isMissingModuleError,
  matchesFilters,
  normalizeFilters,
  normalizeScenarioModule,
  resolveScenarioModuleId,
  resolveScenarioSourcePath,
  summarizeCatalog,
  summarizeResults,
  toErrorPayload,
} from './scenario-helpers.js';

import { siteRegistry } from '../registry/sites.js';

export function benchmarkRunSucceeded(run) {
  return run?.acceptance?.ok === true && run?.coverage?.betaGate?.ok === true;
}

function cloneSelectedSite(site, scenarios) {
  return {
    id: site.id,
    name: site.name,
    status: site.status,
    baseUrl: site.baseUrl,
    tags: [...(site.tags ?? [])],
    compliance: { ...site.compliance },
    evidence: {
      ...site.evidence,
      sourceLinks: [...(site.evidence?.sourceLinks ?? [])],
      notes: [...(site.evidence?.notes ?? [])],
    },
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      status: scenario.status,
      module: scenario.module,
      entryUrl: scenario.entryUrl,
      tags: [...(scenario.tags ?? [])],
      guide: {
        steps: [...(scenario.guide?.steps ?? [])],
        expectedResult: scenario.guide?.expectedResult ?? '',
        failureModes: [...(scenario.guide?.failureModes ?? [])],
      },
      executable: {
        command: `node scripts/run-benchmarks.js --site ${site.id} --scenario ${scenario.id}`,
        moduleId: resolveScenarioModuleId(site, scenario),
        sourcePath: resolveScenarioSourcePath(site, scenario),
      },
      metadata: { ...scenario.metadata },
    })),
    sourceUrl: site.sourceUrl,
  };
}

function buildRunId() {
  return `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function defaultModuleLoader(moduleId) {
  return import(moduleId);
}

function normalizeRegistry(registry) {
  return registry.map((site) => defineSiteManifest(site, site.sourceUrl));
}

function isRunnableScenario(site, scenario) {
  return isQualifiedStatus(site.status) && isQualifiedStatus(scenario.status);
}

function selectRegistry(registry, filters, options = {}) {
  const sites = [];
  const results = [];
  const runnableOnly = options.runnableOnly === true;

  for (const candidate of registry) {
    const filteredScenarios = candidate.scenarios.filter((scenario) => matchesFilters(candidate, scenario, filters));
    const scenarios = runnableOnly ? filteredScenarios.filter((scenario) => isRunnableScenario(candidate, scenario)) : filteredScenarios;
    if (scenarios.length === 0) {
      continue;
    }

    sites.push(cloneSelectedSite(candidate, scenarios));
    results.push(...scenarios.map((scenario) => ({ site: candidate, scenario })));
  }

  return { sites, selectedScenarios: results };
}

function createToolFailure(name, response) {
  const error = new Error(`${name} returned an application-level failure`);
  error.code = 'BENCHMARK_TOOL_FAILED';
  error.details = { toolName: name, response };
  return error;
}

function createExternalSiteUnavailableError(response, site, scenario) {
  const error = new Error(`External benchmark site is unavailable for ${site.id}/${scenario.id}.`);
  error.code = 'EXTERNAL_SITE_UNAVAILABLE';
  error.details = {
    siteId: site.id,
    scenarioId: scenario.id,
    url: response?.url ?? response?.source?.finalUrl ?? scenario.entryUrl ?? site.baseUrl,
    title: response?.title ?? response?.source?.finalTitle ?? null,
  };
  return error;
}

function isTransientOpenFailure(response) {
  const message = response?.error?.message ?? '';
  if (typeof message !== 'string') {
    return false;
  }

  return (
    message.includes('Timeout') ||
    message.includes('net::ERR_CONNECTION_RESET') ||
    message.includes('net::ERR_CONNECTION_ABORTED') ||
    message.includes('net::ERR_CONNECTION_CLOSED') ||
    message.includes('net::ERR_HTTP2_PROTOCOL_ERROR')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeSessionWithContract(client, sessionId) {
  const response = await client.closeSession(sessionId);
  if (response === false || response?.ok === false) {
    throw createToolFailure('browser_close', response);
  }

  return response ?? { ok: true };
}

function attachCleanupError(result, error) {
  const payload = toErrorPayload(error);

  if (result.status === 'passed') {
    result.status = 'failed';
    result.reason = createReason(error?.code ?? 'SCENARIO_CLEANUP_FAILED', error?.message ?? 'Scenario cleanup failed');
    result.error = payload;
    result.summary = 'Scenario cleanup failed.';
    return;
  }

  if (!result.error) {
    result.error = payload;
    return;
  }

  const existingDetails =
    result.error.details && typeof result.error.details === 'object' ? { ...result.error.details } : {};
  const cleanupErrors = Array.isArray(existingDetails.cleanupErrors) ? [...existingDetails.cleanupErrors] : [];
  cleanupErrors.push(payload);
  existingDetails.cleanupErrors = cleanupErrors;
  result.error = {
    ...result.error,
    details: existingDetails,
  };
}

function appendCleanupErrorDetails(details, error) {
  const nextDetails = details && typeof details === 'object' ? { ...details } : {};
  const cleanupErrors = Array.isArray(nextDetails.cleanupErrors) ? [...nextDetails.cleanupErrors] : [];
  cleanupErrors.push(toErrorPayload(error));
  nextDetails.cleanupErrors = cleanupErrors;
  return nextDetails;
}

function preservePrimaryError(primaryError, cleanupError) {
  if (!primaryError || typeof primaryError !== 'object') {
    return primaryError;
  }

  primaryError.details = appendCleanupErrorDetails(primaryError.details, cleanupError);
  return primaryError;
}

function createScenarioContext({ site, scenario, client, stepRecorder, metrics, activeSessions }) {
  return {
    site,
    scenario,
    metrics,
    recordStep: stepRecorder.recordStep,
    async callTool(name, args = {}) {
      metrics.toolCalls += 1;
      const response = await client.callTool(name, args);
      if (response?.ok === false) {
        throw createToolFailure(name, response);
      }
      return response;
    },
    async openSession(options = {}) {
      const openOptions = { url: scenario.entryUrl ?? site.baseUrl, ...options };
      let lastResponse = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        metrics.toolCalls += 1;
        const response = await client.openSession(openOptions);
        lastResponse = response;

        if (response?.ok !== false && response?.sessionId) {
          if (response?.title === 'Application Error') {
            throw createExternalSiteUnavailableError(response, site, scenario);
          }

          activeSessions.add(response.sessionId);
          metrics.sessionsOpened += 1;
          return response;
        }

        if (!isTransientOpenFailure(response) || attempt === 2) {
          throw createToolFailure('browser_open', response);
        }

        await sleep(250 * (attempt + 1));
      }

      throw createToolFailure('browser_open', lastResponse);
    },
    async closeSession(sessionId) {
      if (!activeSessions.has(sessionId)) {
        return false;
      }

      metrics.toolCalls += 1;
      await closeSessionWithContract(client, sessionId);
      activeSessions.delete(sessionId);
      return true;
    },
    async withSession(options = {}, callback) {
      const session = await this.openSession(options);
      let outcome;
      let primaryError = null;

      try {
        outcome = await callback(session.sessionId, session);
      } catch (error) {
        primaryError = error;
      }

      try {
        await this.closeSession(session.sessionId);
      } catch (cleanupError) {
        if (!primaryError) {
          throw cleanupError;
        }

        preservePrimaryError(primaryError, cleanupError);
      }

      if (primaryError) {
        throw primaryError;
      }

      return outcome;
    },
  };
}

function baseResult(site, scenario, moduleId) {
  const sourcePath = resolveScenarioSourcePath(site, scenario);
  return {
    siteId: site.id,
    siteName: site.name,
    scenarioId: scenario.id,
    title: scenario.title,
    module: moduleId,
    executable: {
      command: `node scripts/run-benchmarks.js --site ${site.id} --scenario ${scenario.id}`,
      moduleId,
      sourcePath,
    },
    status: 'failed',
    executed: false,
    summary: '',
    details: null,
    reason: null,
    error: null,
    steps: [],
    artifacts: [],
    metrics: {
      toolCalls: 0,
      sessionsOpened: 0,
      codeQuality: null,
    },
    startedAt: null,
    finishedAt: null,
    durationMs: 0,
  };
}

function extractCodeQualityMetrics(steps = []) {
  const entries = steps
    .map((step) => ({
      codeQuality: step.details?.codeQuality ?? null,
      generatedValidation: step.details?.generatedValidation ?? null,
    }))
    .filter((entry) => entry.codeQuality && typeof entry.codeQuality === 'object');

  if (entries.length === 0) {
    return null;
  }

  const latest = entries.at(-1).codeQuality;
  const attemptedGeneratedValidations = entries.filter(
    (entry) =>
      entry.generatedValidation &&
      typeof entry.generatedValidation === 'object' &&
      entry.generatedValidation.skipped !== true
  );

  return {
    ...latest,
    evidenceScope: latest.evidenceScope ?? (attemptedGeneratedValidations.length > 0 ? 'cumulative_session_validation_evidence' : null),
    firstValidationPassed: entries.every((entry) => entry.codeQuality.firstValidationPassed === true),
    generatedValidationPassed:
      attemptedGeneratedValidations.length === 0
        ? latest.generatedValidationPassed ?? false
        : attemptedGeneratedValidations.every((entry) => entry.generatedValidation.ok === true),
    generatedValidationScope:
      attemptedGeneratedValidations.length === 0
        ? latest.generatedValidationScope ?? 'not_attempted'
        : 'cumulative_generated_plan',
    repaired: entries.some((entry) => entry.codeQuality.repaired === true),
    validationBatchCount: entries.length,
    generatedValidationAttemptCount: attemptedGeneratedValidations.length,
  };
}

async function executeScenario({ site, scenario, ensureClient, moduleLoader }) {
  const moduleId = resolveScenarioModuleId(site, scenario);
  const result = baseResult(site, scenario, moduleId);
  const stepRecorder = createStepRecorder();
  const activeSessions = new Set();
  const startedMs = Date.now();
  let client = null;

  result.startedAt = new Date(startedMs).toISOString();

  try {
    if (!moduleId) {
      result.status = 'skipped';
      result.reason = createReason('SCENARIO_MODULE_UNSPECIFIED', 'Scenario manifest does not declare a module');
      result.summary = 'Scenario skipped because its module is not declared yet.';
      return result;
    }

    const scenarioModule = normalizeScenarioModule(await moduleLoader(moduleId, { site, scenario }), scenario);
    client = await ensureClient();
    const context = createScenarioContext({
      site,
      scenario,
      client,
      stepRecorder,
      metrics: result.metrics,
      activeSessions,
    });
    result.executed = true;
    const outcome = (await scenarioModule.run(context)) ?? {};

    result.status = outcome.status ?? 'passed';
    result.summary = outcome.summary ?? `${scenario.title} ${result.status}`;
    result.details = outcome.details ?? null;
    result.artifacts = Array.isArray(outcome.artifacts) ? outcome.artifacts : [];
    if (result.status === 'skipped') {
      result.reason = outcome.reason ?? createReason('SCENARIO_SKIPPED', 'Scenario requested a skip');
    } else if (result.status === 'failed') {
      result.reason = outcome.reason ?? createReason('SCENARIO_REPORTED_FAILURE', 'Scenario returned a failed status');
    }
  } catch (error) {
    if (isMissingModuleError(error)) {
      result.status = 'skipped';
      result.reason = createReason('SCENARIO_MODULE_MISSING', `Scenario module is not implemented: ${scenario.module}`);
      result.summary = 'Scenario skipped because its implementation module is missing.';
    } else if (error?.code === 'EXTERNAL_SITE_UNAVAILABLE') {
      result.status = 'skipped';
      result.reason = createReason(
        'EXTERNAL_SITE_UNAVAILABLE',
        error.message ?? 'Scenario skipped because the external benchmark site is unavailable.',
        error.details
      );
      result.summary = 'Scenario skipped because the external benchmark site is unavailable.';
    } else {
      result.status = 'failed';
      result.reason = createReason(error?.code ?? 'SCENARIO_EXECUTION_FAILED', error?.message ?? 'Scenario execution failed');
      result.error = toErrorPayload(error);
      result.summary = 'Scenario execution failed.';
    }
  } finally {
    for (const sessionId of [...activeSessions]) {
      if (!client) {
        continue;
      }

      try {
        await closeSessionWithContract(client, sessionId);
        activeSessions.delete(sessionId);
      } catch (error) {
        attachCleanupError(result, error);
      }
    }
    result.steps = stepRecorder.steps;
    result.metrics.codeQuality = extractCodeQualityMetrics(result.steps);
    const finishedMs = Date.now();
    result.finishedAt = new Date(finishedMs).toISOString();
    result.durationMs = finishedMs - startedMs;
  }

  return result;
}

export async function runBenchmarks(options = {}) {
  const registry = normalizeRegistry(options.registry ?? siteRegistry);
  const filters = normalizeFilters(options.filters);
  const catalog = selectRegistry(registry, filters);
  const selection = selectRegistry(registry, filters, { runnableOnly: true });
  const run = {
    schemaVersion: 1,
    runId: options.runId ?? buildRunId(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    filters: {
      site: [...filters.site],
      scenario: [...filters.scenario],
      tag: [...filters.tag],
    },
    environment: {
      toolNames: [],
    },
    catalog: {
      sites: catalog.sites,
      summary: summarizeCatalog(catalog.sites),
    },
    coverage: buildCoverageMatrix(registry),
    sites: selection.sites,
    results: [],
    summary: buildEmptySummary(),
    acceptance: evaluateAcceptance(),
    reportPaths: {},
  };

  let client = null;
  const ensureClient = async () => {
    if (client) {
      return client;
    }

    client = await (options.clientFactory ?? createBenchmarkClient)({
      cwd: options.cwd,
      command: options.command,
      args: options.args,
    });

    if (typeof client.connect === 'function') {
      await client.connect();
    }

    if (typeof client.listTools === 'function') {
      run.environment.toolNames = (await client.listTools()).map((tool) => tool.name ?? tool).sort();
    }

    return client;
  };

  try {
    for (const entry of selection.selectedScenarios) {
      run.results.push(
        await executeScenario({
          site: entry.site,
          scenario: entry.scenario,
          ensureClient,
          moduleLoader: options.moduleLoader ?? defaultModuleLoader,
        })
      );
    }
  } finally {
    run.finishedAt = new Date().toISOString();
    run.summary = summarizeResults(selection.sites, run.results);
    run.acceptance = evaluateAcceptance(run.summary);
    run.coverage = buildCoverageMatrix(registry, run.results);

    if (client && typeof client.close === 'function') {
      await client.close();
    }
  }

  if (options.outputDir) {
    run.reportPaths = await writeBenchmarkReports(run, {
      outputDir: options.outputDir,
      formats: options.reportFormats ?? ['json', 'markdown'],
      stem: options.reportStem,
    });
  }

  return run;
}

export function listBenchmarks(options = {}) {
  const registry = normalizeRegistry(options.registry ?? siteRegistry);
  const filters = normalizeFilters(options.filters);
  const selection = selectRegistry(registry, filters);

  return selection.sites.map((site) => ({
    id: site.id,
    name: site.name,
    status: site.status,
    defaultRun: isQualifiedStatus(site.status),
    baseUrl: site.baseUrl,
    scenarios: site.scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      status: scenario.status,
      defaultRun: isQualifiedStatus(site.status) && isQualifiedStatus(scenario.status),
      module: scenario.module,
      tags: scenario.tags,
      guide: scenario.guide,
      executable: scenario.executable,
      metadata: { ...scenario.metadata },
    })),
    compliance: site.compliance,
    evidence: site.evidence,
  }));
}
