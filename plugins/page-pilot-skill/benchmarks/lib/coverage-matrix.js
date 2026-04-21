import { readFileSync } from 'node:fs';

import { defineSiteManifest, isQualifiedStatus, resolveScenarioSourcePath } from './scenario-helpers.js';

export const BETA_BENCHMARK_REQUIREMENTS = {
  qualifiedSiteCount: 11,
  minimumQualifiedScenarioCount: 49,
  maximumPendingScenarioCount: 1,
  minimumScenarioCountsBySite: {
    toscrape: 4,
    'scrape-this-site': 4,
    'web-scraper-test-sites': 5,
    tryscrapeme: 4,
    'the-internet': 7,
    'ui-testing-playground': 6,
    'expand-testing': 6,
    'qa-playground': 5,
    'rpa-challenge': 1,
    demoqa: 4,
    parabank: 3,
  },
  codeQuality: {
    minimumSemanticLocatorRatio: 0.75,
    maximumCssFallbackRatio: 0.3,
    minimumUniqueLocatorHitRate: 0.75,
    minimumFirstValidationPassRate: 0.75,
    minimumGeneratedValidationPassRate: 0.75,
    minimumRepairPassRate: 0.75,
    maximumAverageCodeLineCount: 40,
  },
};

function normalizeRegistry(registry = []) {
  return registry.map((site) => defineSiteManifest(site, site.sourceUrl));
}

function inferCodeQualityEligibility(site = {}, scenario = {}) {
  if (typeof scenario.metadata?.codeQualityEligible === 'boolean') {
    return scenario.metadata.codeQualityEligible;
  }

  const sourcePath = resolveScenarioSourcePath(site, scenario);
  if (!sourcePath) {
    return false;
  }

  try {
    const source = readFileSync(sourcePath, 'utf8');
    return /\bvalidatePlaywright\s*\(/.test(source);
  } catch {
    return false;
  }
}

function siteScenarioSummary(site) {
  const qualifiedScenarios = site.scenarios.filter((scenario) => isQualifiedStatus(scenario.status));
  const pendingScenarios = site.scenarios.filter((scenario) => scenario.status === 'pending');
  const excludedScenarios = site.scenarios.filter((scenario) => scenario.status === 'excluded');

  return {
    id: site.id,
    name: site.name,
    status: site.status,
    qualifiedScenarioCount: qualifiedScenarios.length,
    pendingScenarioCount: pendingScenarios.length,
    excludedScenarioCount: excludedScenarios.length,
  };
}

function round(value) {
  return Number((value ?? 0).toFixed(2));
}

function buildCodeQualitySummary(results = []) {
  const entries = results
    .map((result) => result.metrics?.codeQuality ?? null)
    .filter((entry) => entry && typeof entry === 'object');

  const repairAttemptCount = entries.filter((entry) => entry.firstValidationPassed === false).length;
  const repairSuccessCount = entries.filter((entry) => entry.firstValidationPassed === false && entry.repaired === true).length;

  if (entries.length === 0) {
    return {
      scenarioCount: 0,
      semanticLocatorRatio: null,
      cssFallbackRatio: null,
      uniqueLocatorHitRate: null,
      firstValidationPassRate: null,
      generatedValidationPassRate: null,
      repairAttemptCount,
      repairPassRate: repairAttemptCount === 0 ? null : 0,
      averageCodeLineCount: null,
    };
  }

  const totals = entries.reduce(
    (accumulator, entry) => ({
      locatorCount: accumulator.locatorCount + (entry.locatorCount ?? 0),
      semanticLocatorCount: accumulator.semanticLocatorCount + (entry.semanticLocatorCount ?? 0),
      cssFallbackCount: accumulator.cssFallbackCount + (entry.cssFallbackCount ?? 0),
      uniqueLocatorHitCount: accumulator.uniqueLocatorHitCount + (entry.uniqueLocatorHitCount ?? 0),
      firstValidationPassCount: accumulator.firstValidationPassCount + (entry.firstValidationPassed ? 1 : 0),
      generatedValidationPassCount: accumulator.generatedValidationPassCount + (entry.generatedValidationPassed ? 1 : 0),
      codeLineCount: accumulator.codeLineCount + (entry.codeLineCount ?? 0),
    }),
    {
      locatorCount: 0,
      semanticLocatorCount: 0,
      cssFallbackCount: 0,
      uniqueLocatorHitCount: 0,
      firstValidationPassCount: 0,
      generatedValidationPassCount: 0,
      codeLineCount: 0,
    }
  );

  return {
    scenarioCount: entries.length,
    locatorCount: totals.locatorCount,
    semanticLocatorCount: totals.semanticLocatorCount,
    cssFallbackCount: totals.cssFallbackCount,
    uniqueLocatorHitCount: totals.uniqueLocatorHitCount,
    semanticLocatorRatio: totals.locatorCount === 0 ? 0 : round(totals.semanticLocatorCount / totals.locatorCount),
    cssFallbackRatio: totals.locatorCount === 0 ? 0 : round(totals.cssFallbackCount / totals.locatorCount),
    uniqueLocatorHitRate: totals.locatorCount === 0 ? 0 : round(totals.uniqueLocatorHitCount / totals.locatorCount),
    firstValidationPassRate: round(totals.firstValidationPassCount / entries.length),
    generatedValidationPassRate: round(totals.generatedValidationPassCount / entries.length),
    repairAttemptCount,
    repairPassRate: repairAttemptCount === 0 ? null : round(repairSuccessCount / repairAttemptCount),
    averageCodeLineCount: round(totals.codeLineCount / entries.length),
  };
}

function evaluateBetaGate(summary, siteDepth, codeQuality, options = {}) {
  const enforced = options.enforceBetaGate !== false;
  const scope = options.scope ?? 'full-registry';

  if (!enforced) {
    return {
      ok: true,
      enforced: false,
      scope,
      failures: [],
      reason: 'filtered selection',
    };
  }

  const failures = [];
  const eligibleQualifiedScenarioCount =
    summary.codeQualityEligibleScenarioCount - (summary.codeQualityExternalUnavailableSkipped ?? 0);

  if (summary.qualifiedSiteCount !== BETA_BENCHMARK_REQUIREMENTS.qualifiedSiteCount) {
    failures.push(
      `qualified site count ${summary.qualifiedSiteCount} did not match required ${BETA_BENCHMARK_REQUIREMENTS.qualifiedSiteCount}`
    );
  }
  if (summary.qualifiedScenarioCount < BETA_BENCHMARK_REQUIREMENTS.minimumQualifiedScenarioCount) {
    failures.push(
      `qualified scenario count ${summary.qualifiedScenarioCount} is below required ${BETA_BENCHMARK_REQUIREMENTS.minimumQualifiedScenarioCount}`
    );
  }
  if (summary.pendingScenarioCount > BETA_BENCHMARK_REQUIREMENTS.maximumPendingScenarioCount) {
    failures.push(
      `pending scenario count ${summary.pendingScenarioCount} exceeds allowed ${BETA_BENCHMARK_REQUIREMENTS.maximumPendingScenarioCount}`
    );
  }

  for (const [siteId, minimumCount] of Object.entries(BETA_BENCHMARK_REQUIREMENTS.minimumScenarioCountsBySite)) {
    const actual = siteDepth.find((entry) => entry.id === siteId);
    if (!actual) {
      failures.push(`missing site depth entry for ${siteId}`);
      continue;
    }
    if (actual.qualifiedScenarioCount < minimumCount) {
      failures.push(
        `${siteId} qualified scenario count ${actual.qualifiedScenarioCount} is below required ${minimumCount}`
      );
    }
  }

  if (codeQuality.scenarioCount < eligibleQualifiedScenarioCount) {
    failures.push(
      `code-quality scenarios ${codeQuality.scenarioCount} are below required ${eligibleQualifiedScenarioCount}`
    );
  }
  if (eligibleQualifiedScenarioCount > 0) {
    if (codeQuality.semanticLocatorRatio < BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumSemanticLocatorRatio) {
      failures.push(
        `semantic locator ratio ${codeQuality.semanticLocatorRatio} is below required ${BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumSemanticLocatorRatio}`
      );
    }
    if (codeQuality.cssFallbackRatio > BETA_BENCHMARK_REQUIREMENTS.codeQuality.maximumCssFallbackRatio) {
      failures.push(
        `css fallback ratio ${codeQuality.cssFallbackRatio} exceeds allowed ${BETA_BENCHMARK_REQUIREMENTS.codeQuality.maximumCssFallbackRatio}`
      );
    }
    if (codeQuality.uniqueLocatorHitRate < BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumUniqueLocatorHitRate) {
      failures.push(
        `unique locator hit rate ${codeQuality.uniqueLocatorHitRate} is below required ${BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumUniqueLocatorHitRate}`
      );
    }
    if (codeQuality.firstValidationPassRate < BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumFirstValidationPassRate) {
      failures.push(
        `first validation pass rate ${codeQuality.firstValidationPassRate} is below required ${BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumFirstValidationPassRate}`
      );
    }
    if (codeQuality.generatedValidationPassRate < BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumGeneratedValidationPassRate) {
      failures.push(
        `generated validation pass rate ${codeQuality.generatedValidationPassRate} is below required ${BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumGeneratedValidationPassRate}`
      );
    }
    if (
      codeQuality.repairPassRate !== null &&
      codeQuality.repairPassRate < BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumRepairPassRate
    ) {
      failures.push(
        `repair pass rate ${codeQuality.repairPassRate} is below required ${BETA_BENCHMARK_REQUIREMENTS.codeQuality.minimumRepairPassRate}`
      );
    }
    if (codeQuality.averageCodeLineCount > BETA_BENCHMARK_REQUIREMENTS.codeQuality.maximumAverageCodeLineCount) {
      failures.push(
        `average generated code line count ${codeQuality.averageCodeLineCount} exceeds allowed ${BETA_BENCHMARK_REQUIREMENTS.codeQuality.maximumAverageCodeLineCount}`
      );
    }
  }

  return {
    ok: failures.length === 0,
    enforced: true,
    scope,
    failures,
    reason: null,
  };
}

export function buildCoverageMatrix(registry = [], results = [], options = {}) {
  const sites = normalizeRegistry(registry);
  const siteDepth = sites.map(siteScenarioSummary).sort((left, right) => left.id.localeCompare(right.id));
  const externalUnavailableSkipped = results.filter(
    (result) => result.status === 'skipped' && result.reason?.code === 'EXTERNAL_SITE_UNAVAILABLE'
  ).length;
  const codeQualityEligibleScenarios = sites.flatMap((site) =>
    site.scenarios
      .filter((scenario) => isQualifiedStatus(site.status) && isQualifiedStatus(scenario.status) && inferCodeQualityEligibility(site, scenario))
      .map((scenario) => `${site.id}/${scenario.id}`)
  );
  const codeQualityEligibleScenarioSet = new Set(codeQualityEligibleScenarios);
  const codeQualityExternalUnavailableSkipped = results.filter(
    (result) =>
      result.status === 'skipped' &&
      result.reason?.code === 'EXTERNAL_SITE_UNAVAILABLE' &&
      codeQualityEligibleScenarioSet.has(`${result.siteId}/${result.scenarioId}`)
  ).length;
  const summary = {
    siteCount: sites.length,
    qualifiedSiteCount: sites.filter((site) => isQualifiedStatus(site.status)).length,
    qualifiedScenarioCount: siteDepth.reduce((total, site) => total + site.qualifiedScenarioCount, 0),
    pendingScenarioCount: siteDepth.reduce((total, site) => total + site.pendingScenarioCount, 0),
    excludedScenarioCount: siteDepth.reduce((total, site) => total + site.excludedScenarioCount, 0),
    codeQualityEligibleScenarioCount: codeQualityEligibleScenarios.length,
    codeQualityExternalUnavailableSkipped,
    externalUnavailableSkipped,
  };
  const codeQuality = buildCodeQualitySummary(
    results.filter((result) => codeQualityEligibleScenarioSet.has(`${result.siteId}/${result.scenarioId}`))
  );

  return {
    summary,
    siteDepth,
    codeQuality,
    betaGate: evaluateBetaGate(summary, siteDepth, codeQuality, options),
  };
}
