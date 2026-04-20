import { fileURLToPath } from 'node:url';

const KNOWN_STATUSES = new Set(['qualified', 'pending', 'excluded']);

function ensureItemList(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => ensureItemList(entry));
  }

  return [String(value)];
}

function ensureCsvList(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => ensureCsvList(entry));
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ensureList(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function ensureString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function cloneObject(value) {
  return value && typeof value === 'object' ? { ...value } : {};
}

function normalizeStatus(value, fallback = 'pending') {
  const normalizedFallback = ensureString(fallback, 'pending').trim().toLowerCase();
  if (!KNOWN_STATUSES.has(normalizedFallback)) {
    const error = new Error(`Unsupported benchmark fallback status "${fallback}"`);
    error.code = 'BENCHMARK_INVALID_STATUS';
    error.details = { status: fallback };
    throw error;
  }

  if (value === undefined || value === null || value === '') {
    return normalizedFallback;
  }

  const status = String(value).trim().toLowerCase();
  if (KNOWN_STATUSES.has(status)) {
    return status;
  }

  const error = new Error(`Unsupported benchmark status "${value}"`);
  error.code = 'BENCHMARK_INVALID_STATUS';
  error.details = { status: value };
  throw error;
}

function defineScenarioGuide(guide = {}) {
  return {
    steps: ensureItemList(guide.steps),
    expectedResult: ensureString(guide.expectedResult),
    failureModes: ensureItemList(guide.failureModes),
  };
}

export function defineScenarioRef(scenario = {}) {
  return {
    id: String(scenario.id ?? ''),
    title: String(scenario.title ?? scenario.id ?? ''),
    status: normalizeStatus(scenario.status),
    module: scenario.module ? String(scenario.module) : null,
    entryUrl: scenario.entryUrl ? String(scenario.entryUrl) : null,
    tags: ensureItemList(scenario.tags),
    guide: defineScenarioGuide(scenario.guide),
    metadata: cloneObject(scenario.metadata),
  };
}

export function defineSiteManifest(site = {}, sourceUrl = null) {
  return {
    id: String(site.id ?? ''),
    name: String(site.name ?? site.id ?? ''),
    status: normalizeStatus(site.status),
    baseUrl: String(site.baseUrl ?? ''),
    tags: ensureItemList(site.tags),
    sourceUrl: sourceUrl ? String(sourceUrl) : null,
    compliance: {
      ...cloneObject(site.compliance),
      notes: ensureItemList(site.compliance?.notes),
    },
    evidence: {
      ...cloneObject(site.evidence),
      lastReviewedAt: site.evidence?.lastReviewedAt ?? null,
      sourceLinks: ensureItemList(site.evidence?.sourceLinks),
      notes: ensureItemList(site.evidence?.notes),
    },
    scenarios: ensureList(site.scenarios).map((scenario) => defineScenarioRef(scenario)),
  };
}

export function normalizeFilters(filters = {}) {
  return {
    site: new Set(ensureCsvList(filters.site)),
    scenario: new Set(ensureCsvList(filters.scenario)),
    tag: new Set(ensureCsvList(filters.tag)),
  };
}

export function buildScenarioKey(siteId, scenarioId) {
  return `${siteId}:${scenarioId}`;
}

export function isQualifiedStatus(status) {
  return normalizeStatus(status) === 'qualified';
}

export function matchesFilters(site, scenario, filters = {}) {
  const siteMatch = filters.site.size === 0 || filters.site.has(site.id);
  const scenarioKey = buildScenarioKey(site.id, scenario.id);
  const scenarioMatch = filters.scenario.size === 0 || filters.scenario.has(scenario.id) || filters.scenario.has(scenarioKey);
  const tags = new Set([...(site.tags ?? []), ...(scenario.tags ?? [])]);
  const tagMatch = filters.tag.size === 0 || [...filters.tag].every((tag) => tags.has(tag));
  return siteMatch && scenarioMatch && tagMatch;
}

export function createStepRecorder() {
  const steps = [];

  return {
    steps,
    recordStep(title, status = 'passed', details = null) {
      steps.push({
        title: String(title),
        status,
        details: details ?? undefined,
      });
    },
  };
}

export function createReason(code, message, details = null) {
  return {
    code,
    message,
    details: details ?? undefined,
  };
}

export function toErrorPayload(error) {
  return {
    message: error?.message ?? 'Unknown benchmark error',
    stack: error?.stack,
    code: error?.code,
    details: error?.details,
  };
}

export function isMissingModuleError(error) {
  return error?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/i.test(error?.message ?? '');
}

export function resolveScenarioModuleId(site, scenario) {
  if (!scenario.module) {
    return null;
  }

  if (/^[a-z]+:/i.test(scenario.module) || scenario.module.startsWith('/')) {
    return scenario.module;
  }

  if (!site.sourceUrl) {
    return scenario.module;
  }

  return new URL(scenario.module, site.sourceUrl).href;
}

export function resolveScenarioSourcePath(site, scenario) {
  const moduleId = resolveScenarioModuleId(site, scenario);
  if (!moduleId) {
    return null;
  }

  if (moduleId.startsWith('file:')) {
    return fileURLToPath(moduleId);
  }

  if (moduleId.startsWith('/')) {
    return moduleId;
  }

  return null;
}

export function normalizeScenarioModule(moduleRecord = {}, fallbackScenario = {}) {
  const candidate = moduleRecord.scenario ?? moduleRecord.default ?? moduleRecord;

  if (typeof candidate?.run !== 'function') {
    const error = new Error(`Scenario module for "${fallbackScenario.id ?? 'unknown'}" does not export a runnable scenario`);
    error.code = 'SCENARIO_INVALID_MODULE';
    throw error;
  }

  return {
    id: candidate.id ?? fallbackScenario.id,
    title: candidate.title ?? fallbackScenario.title,
    run: candidate.run,
  };
}

export function buildEmptySummary() {
  return {
    siteCount: 0,
    selectedScenarioCount: 0,
    executedScenarioCount: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    externalUnavailableSkipped: 0,
  };
}

export function summarizeResults(sites = [], results = []) {
  const externalUnavailableSkipped = results.filter(
    (result) => result.status === 'skipped' && result.reason?.code === 'EXTERNAL_SITE_UNAVAILABLE'
  ).length;
  return {
    siteCount: sites.length,
    selectedScenarioCount: results.length,
    executedScenarioCount: results.filter((result) => result.executed === true).length,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    externalUnavailableSkipped,
  };
}

export function summarizeCatalog(sites = []) {
  const summary = {
    siteCount: sites.length,
    scenarioCount: 0,
    qualifiedSiteCount: 0,
    pendingSiteCount: 0,
    excludedSiteCount: 0,
  };

  for (const site of sites) {
    summary.scenarioCount += site.scenarios.length;
    if (site.status === 'qualified') {
      summary.qualifiedSiteCount += 1;
    } else if (site.status === 'pending') {
      summary.pendingSiteCount += 1;
    } else if (site.status === 'excluded') {
      summary.excludedSiteCount += 1;
    }
  }

  return summary;
}

export function evaluateAcceptance(summary = buildEmptySummary()) {
  const effectiveSelectedScenarioCount = summary.selectedScenarioCount - (summary.externalUnavailableSkipped ?? 0);

  if (effectiveSelectedScenarioCount === 0) {
    return {
      ok: false,
      code: 'NO_SCENARIOS_AVAILABLE',
      message: 'No executable benchmark scenarios remained after excluding unavailable external sites.',
    };
  }

  if (summary.executedScenarioCount === 0) {
    return {
      ok: false,
      code: 'NO_SCENARIOS_EXECUTED',
      message: 'Selected benchmark scenarios did not execute.',
    };
  }

  if (summary.passed === 0) {
    return {
      ok: false,
      code: 'NO_SCENARIOS_PASSED',
      message: 'Executable benchmark scenarios ran, but none passed.',
    };
  }

  const blockingSkipped = summary.skipped - (summary.externalUnavailableSkipped ?? 0);
  if (summary.failed > 0 || blockingSkipped > 0 || summary.passed !== effectiveSelectedScenarioCount) {
    return {
      ok: false,
      code: 'BENCHMARKS_INCOMPLETE',
      message: `Acceptance failed: ${summary.passed}/${effectiveSelectedScenarioCount} executable scenario(s) passed.`,
    };
  }

  return {
    ok: true,
    code: 'ACCEPTANCE_PASSED',
    message: `Acceptance passed: ${summary.passed}/${effectiveSelectedScenarioCount} executable scenario(s) passed.`,
  };
}
