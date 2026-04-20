# Page Pilot Skill Benchmarks

> 2026-04-19 定位更新：本 benchmark 套件现在主要用于衡量 `page-pilot-skill` 作为“帮助模型编写更可靠 Playwright / 网页自动化代码的语义辅助工具”时的页面理解、locator 质量、代码生成与生成后验证能力，而不是验证一个通用浏览器代理能否长期自主完成复杂网站任务。

This directory contains the local acceptance suite for the `page-pilot-skill` MCP server. It is intentionally separate from the default `node --test` discovery path. The benchmark runner treats `scripts/mcp-server.js` as a black box over stdio and validates page understanding, locator quality, interaction validation evidence, and generated Playwright quality against public practice, demo, and sandbox websites.

## Scope and Philosophy

This benchmark suite exists to validate code generation quality against real public pages, not synthetic business flows or autonomous browser-agent completion rates. The repository may still keep small local fixtures for low-level mechanism tests, but acceptance evidence now comes from live public benchmark sites only.

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
- enough validated scenarios to produce stable code-quality evidence
- a code-quality gate that tracks semantic locator ratio, CSS fallback ratio, unique locator hit rate, validated-plan first-pass rate, generated-plan validation pass rate, repair pass rate, and generated code length

The registry can still contain `pending` scenarios when a live public sandbox is temporarily broken or exposes a server-side defect. Those scenarios stay visible in reports, but they do not participate in the default acceptance gate until the site is healthy again. At the moment, the ParaBank `bill-pay` scenario is tracked this way because the live sandbox exposed no source-account options during qualification.

Each site manifest records:

- why the site is acceptable to automate
- which public source pages were reviewed
- the latest review date
- scenario steps, expected results, and failure modes
- executable metadata such as the benchmark command, module identifier, and source path

Each scenario module uses MCP browser tools such as `browser_open`, `browser_scan`, `browser_rank_locators`, `browser_probe`, `browser_validate_playwright`, `browser_generate_playwright`, `browser_repair_playwright`, and `browser_capture_screenshot`. They do not access Playwright `page` objects directly. For benchmark-internal read-only extraction, the harness may also use a private script probe tool that is not part of the public Page Pilot Skill contract.

If a third-party practice site is temporarily unavailable and opens with a known external error page, the runner records that scenario as `EXTERNAL_SITE_UNAVAILABLE`. Those scenarios are still reported, but they are excluded from the acceptance and code-quality denominators for that run so site outages do not masquerade as product regressions.

## Covered Scenario Areas

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

The current Beta-level quality gate is enforced in `benchmarks/lib/coverage-matrix.js`, and `npm run benchmark` exits non-zero when either scenario acceptance or the Beta code-quality gate fails. The acceptance suite now gates:

- registry breadth and per-site scenario depth
- scenarios that emit code-quality evidence
- semantic locator ratio
- CSS fallback ratio
- unique locator hit rate
- validated-plan first pass rate
- generated-plan validation pass rate
- repair pass rate when repairs are attempted
- average generated code length

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
- does the overall code-quality benchmark still satisfy the Beta floor

`npm run benchmark:test` runs the benchmark runner self-checks only. These files intentionally use `*.check.js` so they do not fall into the default `node --test` auto-discovery path used by `npm test`.

## Acceptance Gate

The CLI exits with code `0` only when every selected and runnable benchmark scenario passes **and** the Beta code-quality gate passes. It exits with code `1` when:

- no qualified scenarios match the current filters
- selected scenarios do not execute
- selected scenarios execute but none pass
- any selected scenario fails or is skipped
- the Beta code-quality gate fails even though the runnable scenarios themselves passed

This makes the suite behave like a real acceptance gate rather than a best-effort smoke run.

## Report Shape

The Markdown report is organized as:

- site
- scenario
- planned steps
- expected result
- failure modes
- benchmark harness source
- generated Playwright code
- code-quality gate summary
- runtime steps
- artifacts and errors

When generated-code verification fails, the report still preserves the generated Playwright snippet alongside the failure so the broken code path remains inspectable.

The JSON report is the canonical machine-readable artifact. It includes the same acceptance metadata, the registry inventory summary, per-scenario execution results, and explicit `executable` fields such as `command`, `moduleId`, and `sourcePath`.
