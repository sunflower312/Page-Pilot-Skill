---
name: page-pilot-skill
description: Use when working on web automation in a headless Linux environment and you need to inspect a real page, rank locator options, validate interactions, capture evidence, or turn page evidence into reliable Playwright code using the local browser MCP tools.
---

# Page Pilot Skill

## Overview

Use this skill when Codex should inspect a page and generate Playwright from evidence instead of guessing how the page behaves. It assumes a local MCP server exposes `browser_open`, `browser_scan`, `browser_rank_locators`, `browser_probe`, `browser_validate_playwright`, `browser_generate_playwright`, `browser_repair_playwright`, `browser_capture_screenshot`, `browser_snapshot_dom`, and `browser_close`.

This skill is for headless Linux workflows only. It does not assume a GUI browser, existing login state, browser extensions, or physical mouse/keyboard fallbacks.

## Quick Start

1. Open a page with `browser_open`.
2. Read the page with `browser_scan`.
3. Rank candidate locators with `browser_rank_locators` when more than one semantic target is plausible.
4. If the scan is insufficient, inspect one specific question with `browser_probe`.
5. Validate a locator or interaction hypothesis with `browser_validate_playwright`.
6. Generate Playwright code from the validated evidence with `browser_generate_playwright`.
7. If generated evidence still fails, try `browser_repair_playwright`.
8. Capture a screenshot or DOM snapshot only when extra evidence is needed.

## Workflow

### Scan and analyze a page

Use this when the user needs selectors, page structure, or script scaffolding.

1. Call `browser_open`.
2. Call `browser_scan` with `detailLevel: "standard"`.
3. Read the returned interactive candidates, local context, and locator hints before deciding how to target an element.
4. Draft Playwright code only after you have concrete, page-backed candidates.

### Validate a locator or interaction

Use this when a script fails on click, fill, or waiting behavior.

1. Re-open the same page in a fresh session.
2. Scan the page first.
3. If the structure looks ambiguous, run a small targeted readonly probe with `browser_probe`.
4. Use `browser_validate_playwright` to validate the smallest possible action list.
5. If a primary locator is ambiguous or weak, pass `fallbackLocators` so the tool can verify candidates and select the first unique actionable match.
6. Read the returned `verification` and `stability` metadata before deciding the locator is safe for codegen.
7. If validation fails, run `browser_repair_playwright` before rewriting the code by hand.
8. If the outcome is still unclear, capture a screenshot or DOM snapshot.

### Generate Playwright code

When writing or fixing Playwright:

1. Run `browser_scan` first so code generation starts from real page evidence.
2. When the target interaction is still uncertain, run `browser_validate_playwright` first so the session has verified locator and stability data.
3. Call `browser_generate_playwright` to generate Playwright TypeScript from the latest validated session evidence.
4. Prefer `page.getByRole(...)`, `page.getByLabel(...)`, `page.getByText(..., { exact: true })`, `page.getByPlaceholder(...)`, and `page.getByTestId(...)`.
5. Fall back to CSS only when higher-signal locators are not available.
6. Keep actions minimal and explicit.
7. Use assertions that match the evidence you collected, not assumptions.

## Tool Usage Rules

- `browser_scan` is the default first tool for page understanding. It returns `document`, `summary`, `hints`, and grouped `interactives`.
- `browser_rank_locators` should be used when the scan returns multiple plausible elements and you need a page-backed locator order rather than a guess.
- `browser_probe` is for targeted readonly inspection, not whole-page dumping or autonomous page control.
- `browser_validate_playwright` should validate a concrete hypothesis, not replay a huge end-to-end script.
- `browser_validate_playwright` supports `fallbackLocators` and optional `stability` config on locatable actions. It returns per-step `verification`, `locatorRanking`, `assertionPlan`, and `stability` metadata.
- `browser_validate_playwright` supports `navigate`, `click`, `fill`, `press`, `select`, `check`, `wait_for`, `assert_text`, `assert_url`, and `capture`.
- `browser_repair_playwright` is bounded: it may re-rank candidates, swap locators, and relax waits, but it does not autonomously explore a new workflow.
- `browser_generate_playwright` uses the latest validated session evidence in the current session. If no validated evidence exists, treat that as a hard stop for code generation.
- `browser_capture_screenshot` is for visual confirmation.
- `browser_snapshot_dom` is for DOM evidence and debugging hidden structure.
- Always close sessions with `browser_close` when the workflow is done.

## References

- For workflow examples, read `references/workflows.md`.
- For locator selection guidance, read `references/locator-strategy.md`.
- For screenshot/DOM debugging guidance, read `references/artifact-debugging.md`.

## Output Expectations

When you answer after using this skill:

- cite what the page evidence showed
- show the recommended locator strategy
- mention if a fallback locator was selected after ranking or repair
- mention whether the locator recommendation came from raw scan evidence, validation evidence, or both
- mention if the tool observation showed URL/title/text changes
- mention whether post-action stability settled automatically or required an explicit wait
- explain why a locator is stable or fragile
- provide runnable Playwright code when code is requested
- mention any artifact paths you produced if they matter to debugging

If the MCP tools are unavailable, say so explicitly and fall back to code-only reasoning rather than pretending the page was inspected.
