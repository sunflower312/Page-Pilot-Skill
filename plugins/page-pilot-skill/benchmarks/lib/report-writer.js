import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function toStamp(value) {
  return String(value).replace(/[:.]/g, '-');
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function renderFilterLine(label, entries) {
  if (!entries || entries.length === 0) {
    return `- ${label}: all`;
  }

  return `- ${label}: ${entries.join(', ')}`;
}

function renderReason(result) {
  return result.reason?.code ?? '';
}

function toCodePath(moduleId) {
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

async function readScenarioCode(moduleId) {
  const path = toCodePath(moduleId);
  if (!path) {
    return null;
  }

  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function formatExecutionCommand(target) {
  if (target?.executable?.command) {
    return target.executable.command;
  }

  return `node scripts/run-benchmarks.js --site ${target.siteId} --scenario ${target.scenarioId}`;
}

function renderList(lines, entries) {
  if (!entries || entries.length === 0) {
    lines.push('- none');
    return;
  }

  for (const entry of entries) {
    lines.push(`- ${entry}`);
  }
}

async function renderMarkdown(run) {
  const lines = [
    '# Page Pilot Skill Benchmark Report',
    '',
    `- Run ID: ${run.runId}`,
    `- Started At: ${run.startedAt}`,
    `- Finished At: ${run.finishedAt}`,
    renderFilterLine('Sites', run.filters.site),
    renderFilterLine('Scenarios', run.filters.scenario),
    renderFilterLine('Tags', run.filters.tag),
    '',
    '## Summary',
    '',
    `- Selected sites: ${run.summary.siteCount}`,
    `- Selected scenarios: ${run.summary.selectedScenarioCount}`,
    `- Executed scenarios: ${run.summary.executedScenarioCount}`,
    `- Passed: ${run.summary.passed}`,
    `- Failed: ${run.summary.failed}`,
    `- Skipped: ${run.summary.skipped}`,
    '',
    '## Acceptance',
    '',
    `- Status: ${run.acceptance.ok ? 'passed' : 'failed'}`,
    `- Code: ${run.acceptance.code}`,
    `- Message: ${run.acceptance.message}`,
    '',
    '## Registry Inventory',
    '',
    `- Catalog sites: ${run.catalog.summary.siteCount}`,
    `- Catalog scenarios: ${run.catalog.summary.scenarioCount}`,
    `- Qualified sites: ${run.catalog.summary.qualifiedSiteCount}`,
    `- Pending sites: ${run.catalog.summary.pendingSiteCount}`,
    `- Excluded sites: ${run.catalog.summary.excludedSiteCount}`,
    '',
    '## Coverage',
    '',
    `- Qualified sites: ${run.coverage.summary.qualifiedSiteCount}`,
    `- Qualified scenarios: ${run.coverage.summary.qualifiedScenarioCount}`,
    `- Pending scenarios: ${run.coverage.summary.pendingScenarioCount}`,
    `- Beta gate: ${run.coverage.betaGate.ok ? 'passed' : 'failed'}`,
    '',
  ];

  if (run.coverage.betaGate.failures.length > 0) {
    lines.push('### Coverage Failures', '');
    renderList(lines, run.coverage.betaGate.failures);
    lines.push('');
  }

  lines.push('### Site Depth', '');
  for (const site of run.coverage.siteDepth) {
    lines.push(
      `- ${site.id}: qualified=${site.qualifiedScenarioCount}, pending=${site.pendingScenarioCount}, excluded=${site.excludedScenarioCount}`
    );
  }
  lines.push('', '### Code Quality Gate', '');
  lines.push(`- Eligible scenarios: ${run.coverage.summary.codeQualityEligibleScenarioCount}`);
  lines.push(
    `- Eligible scenarios skipped for external outages: ${run.coverage.summary.codeQualityExternalUnavailableSkipped}`
  );
  lines.push(`- Scenarios with code quality data: ${run.coverage.codeQuality.scenarioCount}`);
  lines.push(`- Semantic locator ratio: ${run.coverage.codeQuality.semanticLocatorRatio}`);
  lines.push(`- CSS fallback ratio: ${run.coverage.codeQuality.cssFallbackRatio}`);
  lines.push(`- Unique locator hit rate: ${run.coverage.codeQuality.uniqueLocatorHitRate}`);
  lines.push(`- First validation pass rate: ${run.coverage.codeQuality.firstValidationPassRate}`);
  lines.push(`- Generated validation pass rate: ${run.coverage.codeQuality.generatedValidationPassRate}`);
  lines.push(`- Repair attempts: ${run.coverage.codeQuality.repairAttemptCount}`);
  lines.push(
    `- Repair pass rate: ${run.coverage.codeQuality.repairPassRate === null ? 'n/a' : run.coverage.codeQuality.repairPassRate}`
  );
  lines.push(`- Average generated code lines: ${run.coverage.codeQuality.averageCodeLineCount}`);
  lines.push('');

  for (const site of run.catalog.sites) {
    lines.push(`### ${site.id} (${site.status})`);
    lines.push('');
    lines.push(`- Name: ${site.name}`);
    lines.push(`- Base URL: ${site.baseUrl}`);
    lines.push(`- Default run: ${site.status === 'qualified' ? 'yes' : 'no'}`);
    lines.push(`- Compliance review: ${site.compliance.reviewStatus ?? 'unknown'}`);
    lines.push(`- Evidence links: ${(site.evidence.sourceLinks ?? []).join(', ') || 'none'}`);
    if ((site.compliance.notes ?? []).length > 0) {
      lines.push(`- Compliance notes: ${site.compliance.notes.join(' | ')}`);
    }
    if ((site.evidence.notes ?? []).length > 0) {
      lines.push(`- Evidence notes: ${site.evidence.notes.join(' | ')}`);
    }
    lines.push('');

    for (const scenario of site.scenarios) {
      lines.push(`#### ${scenario.id} (${scenario.status})`);
      lines.push('');
      lines.push('- Steps');
      renderList(lines, scenario.guide?.steps ?? []);
      lines.push('- Expected Result');
      renderList(lines, [scenario.guide?.expectedResult ?? '']);
      lines.push('- Failure Modes');
      renderList(lines, scenario.guide?.failureModes ?? []);
      lines.push('- Benchmark Harness Source');
      lines.push(`- Command: \`${formatExecutionCommand({ siteId: site.id, scenarioId: scenario.id, executable: scenario.executable })}\``);
      lines.push(`- Module: \`${scenario.executable?.moduleId ?? scenario.module ?? 'not-implemented'}\``);
      lines.push(`- Source Path: \`${scenario.executable?.sourcePath ?? 'not-available'}\``);
      lines.push('');
    }
  }

  lines.push('## Scenario Results', '');

  for (const result of run.results) {
    lines.push(`### ${result.siteId} / ${result.scenarioId}`);
    lines.push('');
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Duration (ms): ${result.durationMs}`);
    lines.push(`- Summary: ${result.summary || 'none'}`);
    lines.push(`- Reason: ${renderReason(result) || 'none'}`);
    lines.push(`- Tool calls: ${result.metrics.toolCalls}`);
    lines.push(`- Sessions opened: ${result.metrics.sessionsOpened}`);
    if (result.metrics.codeQuality) {
      lines.push(`- Semantic locator ratio: ${result.metrics.codeQuality.semanticLocatorRatio}`);
      lines.push(`- CSS fallback ratio: ${result.metrics.codeQuality.cssFallbackRatio}`);
      lines.push(`- Unique locator hit rate: ${result.metrics.codeQuality.uniqueLocatorHitRate}`);
      lines.push(`- First validation passed: ${result.metrics.codeQuality.firstValidationPassed ? 'yes' : 'no'}`);
      lines.push(`- Repaired: ${result.metrics.codeQuality.repaired ? 'yes' : 'no'}`);
      lines.push(`- Generated code lines: ${result.metrics.codeQuality.codeLineCount}`);
    }
    lines.push('');
    lines.push('#### Runtime Steps');
    lines.push('');
    if (result.steps.length === 0) {
      lines.push('- none');
    } else {
      for (const step of result.steps) {
        lines.push(`- ${step.title} [${step.status}]`);
        if (step.details !== undefined) {
          lines.push(`  details: ${escapeCell(JSON.stringify(step.details))}`);
        }
      }
    }
    lines.push('');
    if (result.artifacts.length > 0) {
      lines.push('#### Artifacts');
      lines.push('');
      for (const artifact of result.artifacts) {
        lines.push(`- ${artifact.label ?? artifact.type ?? 'artifact'}: ${artifact.path ?? 'unknown'}`);
      }
      lines.push('');
    }
    if (result.error) {
      lines.push('#### Error');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(result.error, null, 2));
      lines.push('```');
      lines.push('');
    }
    lines.push('#### Benchmark Harness Source');
    lines.push('');
    lines.push('```bash');
    lines.push(formatExecutionCommand(result));
    lines.push('```');
    lines.push('');
    lines.push(`- Module: \`${result.executable?.moduleId ?? result.module ?? 'not-implemented'}\``);
    lines.push(`- Source Path: \`${result.executable?.sourcePath ?? 'not-available'}\``);
    lines.push('');
    const generatedCode = result.steps
      .map((step) => step.details?.generatedCode ?? null)
      .filter(Boolean)
      .at(-1);
    if (generatedCode) {
      lines.push('#### Generated Playwright');
      lines.push('');
      lines.push('```ts');
      lines.push(generatedCode.trimEnd());
      lines.push('```');
      lines.push('');
    }
    const source = await readScenarioCode(result.executable?.moduleId ?? result.module);
    if (source) {
      lines.push('```js');
      lines.push(source.trimEnd());
      lines.push('```');
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function writeBenchmarkReports(run, options = {}) {
  const outputDir = options.outputDir;
  const formats = options.formats ?? ['json', 'markdown'];
  const stem = options.stem ?? `benchmark-report-${toStamp(run.startedAt)}`;
  const reportPaths = {};

  await mkdir(outputDir, { recursive: true });

  if (formats.includes('json')) {
    reportPaths.json = join(outputDir, `${stem}.json`);
    await writeFile(reportPaths.json, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  }

  if (formats.includes('markdown')) {
    reportPaths.markdown = join(outputDir, `${stem}.md`);
    await writeFile(reportPaths.markdown, await renderMarkdown(run), 'utf8');
  }

  return reportPaths;
}
