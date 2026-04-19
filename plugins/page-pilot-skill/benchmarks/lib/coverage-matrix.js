import { defineSiteManifest, isQualifiedStatus } from './scenario-helpers.js';

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
  capabilityRequirements: [
    { id: 'content_extraction', minimumScenarioCount: 18, minimumSiteCount: 8 },
    { id: 'pagination_and_growth', minimumScenarioCount: 8, minimumSiteCount: 5 },
    { id: 'async_waiting', minimumScenarioCount: 9, minimumSiteCount: 5 },
    { id: 'forms_and_auth', minimumScenarioCount: 12, minimumSiteCount: 7 },
    { id: 'dialogs_and_visibility', minimumScenarioCount: 6, minimumSiteCount: 4 },
    { id: 'iframe_and_shadow', minimumScenarioCount: 8, minimumSiteCount: 5 },
    { id: 'stateful_workflows', minimumScenarioCount: 4, minimumSiteCount: 2 },
    { id: 'locator_resilience', minimumScenarioCount: 8, minimumSiteCount: 6 },
  ],
};

function normalizeRegistry(registry = []) {
  return registry.map((site) => defineSiteManifest(site, site.sourceUrl));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
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

function buildCapabilityEntries(sites) {
  const byCapability = new Map();

  for (const site of sites) {
    for (const scenario of site.scenarios) {
      if (!isQualifiedStatus(scenario.status)) {
        continue;
      }

      const capabilities = Array.isArray(scenario.metadata?.capabilities) ? scenario.metadata.capabilities : [];
      for (const capability of capabilities) {
        if (!byCapability.has(capability)) {
          byCapability.set(capability, {
            id: capability,
            siteIds: new Set(),
            scenarios: [],
          });
        }

        const entry = byCapability.get(capability);
        entry.siteIds.add(site.id);
        entry.scenarios.push({
          siteId: site.id,
          scenarioId: scenario.id,
        });
      }
    }
  }

  return [...byCapability.values()]
    .map((entry) => ({
      id: entry.id,
      siteCount: entry.siteIds.size,
      siteIds: sortedUnique([...entry.siteIds]),
      scenarioCount: entry.scenarios.length,
      scenarios: entry.scenarios.sort((left, right) => {
        const leftKey = `${left.siteId}:${left.scenarioId}`;
        const rightKey = `${right.siteId}:${right.scenarioId}`;
        return leftKey.localeCompare(rightKey);
      }),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function evaluateBetaGate(summary, siteDepth, capabilities) {
  const failures = [];

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

  for (const requirement of BETA_BENCHMARK_REQUIREMENTS.capabilityRequirements) {
    const actual = capabilities.find((entry) => entry.id === requirement.id);
    if (!actual) {
      failures.push(`missing capability coverage for ${requirement.id}`);
      continue;
    }
    if (actual.scenarioCount < requirement.minimumScenarioCount) {
      failures.push(
        `${requirement.id} scenario count ${actual.scenarioCount} is below required ${requirement.minimumScenarioCount}`
      );
    }
    if (actual.siteCount < requirement.minimumSiteCount) {
      failures.push(`${requirement.id} site count ${actual.siteCount} is below required ${requirement.minimumSiteCount}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function buildCoverageMatrix(registry = []) {
  const sites = normalizeRegistry(registry);
  const siteDepth = sites.map(siteScenarioSummary).sort((left, right) => left.id.localeCompare(right.id));
  const capabilities = buildCapabilityEntries(sites);
  const summary = {
    siteCount: sites.length,
    qualifiedSiteCount: sites.filter((site) => isQualifiedStatus(site.status)).length,
    qualifiedScenarioCount: siteDepth.reduce((total, site) => total + site.qualifiedScenarioCount, 0),
    pendingScenarioCount: siteDepth.reduce((total, site) => total + site.pendingScenarioCount, 0),
    excludedScenarioCount: siteDepth.reduce((total, site) => total + site.excludedScenarioCount, 0),
  };

  return {
    summary,
    siteDepth,
    capabilities,
    betaGate: evaluateBetaGate(summary, siteDepth, capabilities),
  };
}
