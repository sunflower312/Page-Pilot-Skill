---
name: page-pilot-skill
description: Use when working on web automation in a headless Linux environment and you need to inspect a real page, execute JS, validate interactions, capture evidence, or turn page evidence into reliable Playwright code using the local browser MCP tools.
---

# Page Pilot Skill

## Overview

Use this skill when Codex should verify a page instead of guessing how it behaves. It assumes a local MCP server exposes `browser_open`, `browser_scan`, `browser_execute_js`, `browser_run_actions`, `browser_capture_screenshot`, `browser_snapshot_dom`, `browser_save_storage_state`, and `browser_close`.

This skill is for headless Linux workflows only. It does not assume a GUI browser, existing login state, browser extensions, or physical mouse/keyboard fallbacks.

## Quick Start

1. Open a page with `browser_open`.
2. Get a compact structural summary with `browser_scan`.
3. If the summary is insufficient, inspect specific state with `browser_execute_js`.
4. Validate an interaction hypothesis with `browser_run_actions`.
5. Capture screenshot, DOM snapshot, or storage state only when evidence is needed.
6. Generate or repair Playwright code from the collected evidence with `browser_generate_playwright`.

## Workflow

### Read a page

Use this when the user needs selectors, page structure, or script scaffolding.

1. Call `browser_open`.
2. Call `browser_scan` with `detailLevel: "standard"`.
3. Prefer `preferredLocator` first, then `fallbackLocators`. The scan now returns both on each interactive entry and in relevant hints.
4. Draft Playwright code only after you have concrete candidates.

### Debug a selector or interaction

Use this when a script fails on click, fill, or waiting behavior.

1. Re-open the same page in a fresh session.
2. Scan the page first.
3. If the structure looks ambiguous, run targeted JS to inspect label text, attributes, or runtime state.
4. Use `browser_run_actions` to reproduce the failing flow with the smallest possible action list.
5. If a primary locator is ambiguous or weak, pass `fallbackLocators` so the tool can verify candidates and select the first unique actionable match.
6. Read the returned `verification` and `stability` metadata before deciding the locator is safe for codegen.
7. If the outcome is still unclear, capture a screenshot or DOM snapshot.

### Produce Playwright code

When writing or fixing Playwright:

1. Run `browser_run_actions` first so the flow has verified locator and stability data.
2. Call `browser_generate_playwright` to generate Playwright TS from the latest successful action flow.
3. Prefer `page.getByRole(...)`, `page.getByLabel(...)`, `page.getByText(..., { exact: true })`, `page.getByPlaceholder(...)`, and `page.getByTestId(...)`.
4. Fall back to CSS only when higher-signal locators are not available.
5. Keep actions minimal and explicit.
6. Use assertions that match the evidence you collected, not assumptions.

## Tool Usage Rules

- `browser_scan` is the default first tool for page understanding. It returns `document`, `summary`, `hints`, and grouped `interactives`.
- `browser_execute_js` is for targeted inspection, not whole-page dumping.
- `browser_run_actions` should validate a concrete hypothesis, not replay a huge end-to-end script.
- `browser_run_actions` supports `fallbackLocators` and optional `stability` config on locatable actions. It returns per-step `verification` and `stability` metadata.
- `browser_run_actions` supports `navigate`, `click`, `fill`, `press`, `select`, `check`, `wait_for`, `assert_text`, `assert_url`, and `capture`.
- `browser_generate_playwright` uses the latest successful action flow in the current session. If no successful flow exists, it should be treated as a hard stop for code generation.
- `browser_capture_screenshot` is for visual confirmation.
- `browser_snapshot_dom` is for DOM evidence and debugging hidden structure.
- `browser_save_storage_state` is for persisting the headless context state for later Playwright reuse.
- Always close sessions with `browser_close` when the workflow is done.

## References

- For workflow examples, read `references/workflows.md`.
- For locator selection guidance, read `references/locator-strategy.md`.
- For screenshot/DOM/storage-state debugging guidance, read `references/artifact-debugging.md`.

## Output Expectations

When you answer after using this skill:

- cite what the page evidence showed
- show the recommended locator strategy
- mention if a fallback locator was selected after verification
- mention if the tool observation showed URL/title/text changes
- mention whether post-action stability settled automatically or required an explicit wait
- explain why a locator is stable or fragile
- provide runnable Playwright code when code is requested
- mention any artifact paths you produced if they matter to debugging

If the MCP tools are unavailable, say so explicitly and fall back to code-only reasoning rather than pretending the page was inspected.
