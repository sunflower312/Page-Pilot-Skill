# Semantic Observation Upgrade Plan

> 2026-04-19 定位更新：本文中的语义观察升级现在服务于“为模型提供更可靠页面证据，从而写出更稳的 Playwright 代码”这一目标，而不是为长期自主代理扩张状态机和规划能力。

## Goal

Upgrade `page-pilot-skill` observation from coarse page-level counters to fine-grained semantic state snapshots so action stability can treat obvious UI state transitions as real changes. This phase does **not** add vision execution yet. It prepares the runtime so `no_change` only survives when the page truly shows no meaningful state shift.

## Scope

- Strengthen observation snapshots in `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/observation.js`
- Update trigger classification in `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/action-stability.js`
- Keep action execution contract stable in `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/action-runner.js`
- Add and adjust targeted tests in `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/unit` and `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration`
- Reuse existing semantic signals from structured scan where appropriate, but do not couple observation to full scan output

## Design Constraints

- Do not solve this with more one-off `Save` / modal exceptions.
- Do not add fake business-flow tests or invent new synthetic website flows for this phase.
- Prefer unit tests over new HTML fixtures. Reuse existing mechanism fixtures only if unavoidable.
- Add real-site validation after implementation to confirm the upgraded observation model on an actual modal/save flow.
- Do not introduce a full DOM tree diff.
- Keep the MCP surface unchanged for this phase.
- Observation must stay cheap enough to run before and after every state-changing action.

## File Responsibilities

- `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/observation.js`
  - Capture a semantic snapshot of the current page state.
  - Build before/after diffs that express meaningful UI transitions.
- `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/action-stability.js`
  - Classify semantic observation diffs into `url_change`, `dom_change`, or `no_change`.
- `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/action-runner.js`
  - Keep pre-action baseline capture and per-step stability metadata stable while consuming richer observation payloads.
- `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/unit/action-stability.test.js`
  - Cover trigger classification driven by semantic observation changes.
- `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`
  - Cover real browser fixtures for modal close, primary action mutation, and local content-region swap.
- `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/unit/observation.test.js`
  - Cover semantic snapshot shape and diff behavior directly.

## Semantic Snapshot Model

Replace the current “title + text lines + coarse counts” focus with a layered snapshot:

1. Document identity and navigation signals
   - `url`
   - `title`
   - `documentId`
   - `readyState`

2. Dialog state
   - whether a visible dialog exists
   - dialog label/title
   - dialog summary text
   - dialog primary action label and enabled state

3. Primary action state
   - top-priority visible action label
   - whether it is enabled
   - whether it lives inside a dialog

4. Focused semantic regions
   - small summaries for dialog, main content, and live feedback regions where available
   - these summaries should use compact normalized text, not raw full-page text

5. Interaction state summary
   - retain a compact stats object as a weak signal, but no longer treat it as the main signal

## Diff Semantics

Observation diff should expose first-class semantic change fields such as:

- `dialogChanged`
- `dialogClosed`
- `primaryActionChanged`
- `mainRegionChanged`
- `feedbackChanged`
- `interactionStateChanged`

`domChange` can remain as a backward-compatible compact counter diff, but trigger classification should consider semantic fields before falling back to coarse stats.

## Trigger Rules

Classify changes in this order:

1. `url_change`
   - URL changed

2. `dom_change`
   - document identity changed
   - popup opened
   - dialog state changed
   - primary action changed
   - main content region changed
   - feedback region changed
   - interaction state changed
   - new semantic text appeared
   - coarse stats changed

3. `no_change`
   - only when none of the above fired

## Task Breakdown

### Task 1: Expand semantic snapshot capture

- Upgrade `observation.js` so `captureObservationSnapshot()` records dialog state, primary action state, and compact region summaries.
- Keep snapshot payload deterministic and small.
- Preserve Shadow DOM traversal support already present in the current snapshot collector.

### Task 2: Rebuild observation diff around semantic transitions

- Extend `buildObservation()` to emit semantic change booleans and small detail payloads.
- Keep backward-compatible fields that downstream code already reads where reasonable.
- Update `classifyObservationTrigger()` in `action-stability.js` to prioritize semantic transitions.

### Task 3: Lock behavior with targeted tests

- Add unit tests for:
  - dialog close with unchanged URL
  - primary action label or enabled-state mutation
  - local main-region content swap without navigation
- Add integration coverage only where existing fixtures already support the mechanism. Prefer direct unit tests with semantic snapshots over new synthetic fixture pages.
- Add real-site validation after code changes to confirm that a modal close/save path no longer falls back to `no_change` on an actual website.

### Task 4: Verify no contract regressions

- Run focused unit and integration tests first.
- Then run the full plugin test suite.
- After implementation, run code review, fix issues, and re-run verification.

## Review Loop

1. Implementation by `gpt-5.4 xhigh` worker.
2. Code review by `gpt-5.4 high` reviewer.
3. Fix review findings.
4. Re-review until no important correctness issue remains.
5. Final verification on the plugin test suite before any completion claim.
