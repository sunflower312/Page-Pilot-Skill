import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { listBenchmarks, runBenchmarks } from '../benchmarks/lib/benchmark-runner.js';

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function normalizeFormats(value) {
  if (!value) {
    return ['json', 'markdown'];
  }

  const requested = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (requested.includes('all')) {
    return ['json', 'markdown'];
  }

  const formats = requested.map((entry) => (entry === 'md' ? 'markdown' : entry));
  for (const format of formats) {
    if (!['json', 'markdown'].includes(format)) {
      throw new Error(`Unsupported report format: ${format}`);
    }
  }

  return [...new Set(formats)];
}

function parseArgs(argv) {
  const options = {
    filters: {},
    reportFormats: ['json', 'markdown'],
    list: false,
    help: false,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--help') {
      options.help = true;
      continue;
    }

    if (flag === '--list') {
      options.list = true;
      continue;
    }

    if (flag === '--site') {
      options.filters.site = takeValue(argv, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--scenario') {
      options.filters.scenario = takeValue(argv, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--tag') {
      options.filters.tag = takeValue(argv, index, flag);
      index += 1;
      continue;
    }

    if (flag === '--format') {
      options.reportFormats = normalizeFormats(takeValue(argv, index, flag));
      index += 1;
      continue;
    }

    if (flag === '--output-dir') {
      options.outputDir = takeValue(argv, index, flag);
      index += 1;
      continue;
    }

    throw new Error(`Unknown flag: ${flag}`);
  }

  return options;
}

function defaultOutputDir() {
  const root = fileURLToPath(new URL('../../../artifacts/page-pilot-skill/benchmarks', import.meta.url));
  return join(root, stamp());
}

function printHelp() {
  console.log(`Usage: node scripts/run-benchmarks.js [options]

Options:
  --list                    List registered sites and scenarios
  --site <id[,id]>          Filter by site id
  --scenario <id[,id]>      Filter by scenario id or siteId:scenarioId
  --tag <tag[,tag]>         Filter by tag
  --format <json|markdown>  Select one or both report formats
  --output-dir <path>       Override the report output directory
  --help                    Show this help message
`);
}

function printListing(sites) {
  if (sites.length === 0) {
    console.log('No benchmark scenarios matched the current filters.');
    return;
  }

  for (const site of sites) {
    console.log(`${site.id} - ${site.name} [${site.status}]`);
    console.log(`  baseUrl: ${site.baseUrl}`);
    console.log(`  defaultRun: ${site.defaultRun ? 'yes' : 'no'}`);
    console.log(`  compliance: ${site.compliance.reviewStatus ?? 'unknown'}`);
    for (const scenario of site.scenarios) {
      console.log(`  - ${scenario.id}: ${scenario.title} [${scenario.status}]`);
      console.log(`    defaultRun: ${scenario.defaultRun ? 'yes' : 'no'}`);
      console.log(`    module: ${scenario.module}`);
      console.log(`    tags: ${(scenario.tags ?? []).join(', ') || 'none'}`);
    }
  }
}

function printSummary(run) {
  console.log(`Run ID: ${run.runId}`);
  console.log(`Acceptance: ${run.acceptance.ok ? 'passed' : 'failed'} (${run.acceptance.code})`);
  console.log(`Acceptance message: ${run.acceptance.message}`);
  console.log(`Passed: ${run.summary.passed}`);
  console.log(`Failed: ${run.summary.failed}`);
  console.log(`Skipped: ${run.summary.skipped}`);
  console.log(`Executed: ${run.summary.executedScenarioCount}`);
  console.log(`Selected: ${run.summary.selectedScenarioCount}`);
  if (run.coverage) {
    console.log(
      `Coverage: qualifiedSites=${run.coverage.summary.qualifiedSiteCount}, qualifiedScenarios=${run.coverage.summary.qualifiedScenarioCount}, pendingScenarios=${run.coverage.summary.pendingScenarioCount}`
    );
    console.log(
      `Beta gate: ${run.coverage.betaGate.ok ? 'passed' : 'failed'}${run.coverage.betaGate.failures.length ? ` (${run.coverage.betaGate.failures.join('; ')})` : ''}`
    );
  }

  for (const result of run.results) {
    const reason = result.reason?.code ? ` (${result.reason.code})` : '';
    console.log(`- ${result.siteId}/${result.scenarioId}: ${result.status}${reason}`);
  }

  if (run.reportPaths.json) {
    console.log(`JSON report: ${run.reportPaths.json}`);
  }
  if (run.reportPaths.markdown) {
    console.log(`Markdown report: ${run.reportPaths.markdown}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.list) {
    printListing(listBenchmarks({ filters: options.filters }));
    return;
  }

  const run = await runBenchmarks({
    filters: options.filters,
    outputDir: options.outputDir ?? defaultOutputDir(),
    reportFormats: options.reportFormats,
  });

  printSummary(run);
  process.exitCode = run.acceptance.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
