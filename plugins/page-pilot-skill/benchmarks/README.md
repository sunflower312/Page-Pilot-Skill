# Page Pilot Skill Benchmarks

> 2026-04-19 定位更新：本 benchmark 套件现在主要用于衡量 `page-pilot-skill` 作为“帮助模型编写更可靠 Playwright / 网页自动化代码的语义辅助工具”时的页面理解、locator 质量、代码生成与生成后验证能力，而不是验证一个通用浏览器代理能否长期自主完成复杂网站任务。

This directory contains the local acceptance suite for the `page-pilot-skill` MCP server. It is intentionally separate from the default `node --test` discovery path. The benchmark runner treats `scripts/mcp-server.js` as a black box over stdio and validates the real headless browser workflow against public practice, demo, and sandbox websites.

## Scope and Philosophy

This benchmark suite exists to validate real cross-site capability, not synthetic business flows. The repository may still keep small local fixtures for low-level mechanism tests, but workflow-style acceptance evidence now comes from live public benchmark sites only.

The default acceptance run executes every `qualified` scenario across the current real-site registry:

- `toscrape`
- `scrape-this-site`
- `web-scraper-test-sites`
- `tryscrapeme`
- `the-internet`
- `ui-testing-playground`
- `expand-testing`
- `qa-playground`
- `rpa-challenge`
- `demoqa`
- `parabank`

The current Beta gate expects:

- 11 qualified public benchmark sites
- 49 qualified executable scenarios
- at most 1 pending scenario
- per-site depth across the full registry, not just a single smoke scenario
- a coverage matrix that keeps the benchmark broad enough to catch regressions in extraction, pagination, async timing, forms/auth, dialogs/visibility, iframe/shadow DOM, stateful workflows, and locator resilience

The registry can still contain `pending` scenarios when a live public sandbox is temporarily broken or exposes a server-side defect. Those scenarios stay visible in reports, but they do not participate in the default acceptance gate until the site is healthy again. At the moment, the ParaBank `bill-pay` scenario is tracked this way because the live sandbox exposed no source-account options during qualification.

Each site manifest records:

- why the site is acceptable to automate
- which public source pages were reviewed
- the latest review date
- scenario steps, expected results, and failure modes
- executable metadata such as the benchmark command, module identifier, and source path

Each scenario module uses MCP browser tools such as `browser_open`, `browser_scan`, `browser_run_actions`, `browser_execute_js`, and `browser_capture_screenshot`. They do not access Playwright `page` objects directly.

## Covered Capability Areas

Across the full registry, the benchmark suite now covers these headless-relevant capability areas:

- static extraction
- table extraction
- search and pagination
- AJAX rendering and delayed loading
- load more and infinite scroll
- same-origin iframe extraction
- cross-origin iframe discovery with follow-up extraction
- shadow DOM extraction
- authentication and registration
- unstable locator handling
- visibility and delayed-state transitions
- complex form field extraction
- dynamic label mapping
- stateful multi-page flows

The current Beta-level capability matrix is enforced in `benchmarks/lib/coverage-matrix.js`. The acceptance suite now gates:

- content extraction across 8 or more sites
- pagination and growth flows across 5 or more sites
- async waiting behaviors across 5 or more sites
- forms and authentication across 7 or more sites
- dialogs and visibility transitions across 4 or more sites
- iframe and shadow DOM handling across 5 or more sites
- stateful workflows across 2 or more sites
- locator resilience across 6 or more sites

## Commands

Run commands from `plugins/page-pilot-skill`:

```bash
npm run benchmark
npm run benchmark -- --list
npm run benchmark -- --site the-internet
npm run benchmark -- --site parabank --scenario open-new-account
npm run benchmark -- --site parabank --scenario bill-pay
npm run benchmark:test
```

`npm run benchmark` writes JSON and Markdown artifacts under `artifacts/page-pilot-skill/benchmarks/<timestamp>/`.

The CLI summary also prints the current coverage counts and whether the Beta gate passed, so a local run immediately answers both:

- did the selected scenarios pass
- does the overall benchmark matrix still satisfy the Beta floor

`npm run benchmark:test` runs the benchmark runner self-checks only. These files intentionally use `*.check.js` so they do not fall into the default `node --test` auto-discovery path used by `npm test`.

## Acceptance Gate

The CLI exits with code `0` only when every selected and runnable benchmark scenario passes. It exits with code `1` when:

- no qualified scenarios match the current filters
- selected scenarios do not execute
- selected scenarios execute but none pass
- any selected scenario fails or is skipped

This makes the suite behave like a real acceptance gate rather than a best-effort smoke run.

## Report Shape

The Markdown report is organized as:

- site
- scenario
- planned steps
- expected result
- failure modes
- executable test code
- runtime steps
- artifacts and errors

The JSON report is the canonical machine-readable artifact. It includes the same acceptance metadata, the registry inventory summary, per-scenario execution results, and explicit `executable` fields such as `command`, `moduleId`, and `sourcePath`.
