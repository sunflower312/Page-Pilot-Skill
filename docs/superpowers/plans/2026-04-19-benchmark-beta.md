# Benchmark Beta Deepening Implementation Plan

> 2026-04-19 定位更新：本计划中的 benchmark Beta 门禁现用于约束页面理解、locator 质量、生成代码质量和生成后验证质量，不再以自主代理式流程成功率作为核心目标。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把真实 benchmark 提升到 Beta 级覆盖深度，让默认验收同时校验站点深度、能力矩阵和场景总量。

**Architecture:** 在现有 `benchmarks/` 框架上补一层 coverage matrix，把 Beta 要求做成机器可校验规则；同时扩展偏薄站点的真实场景集合，并把能力归属放进 registry 的稳定元数据中。

**Tech Stack:** Node.js ESM、Playwright、MCP server、真实公开练习站点、本地 benchmark runner

---

## Task 1: 增加 Beta coverage contract

**Files:**
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/coverage-matrix.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/report-writer.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.check.js`

- [ ] 先写会失败的自检，约束 Beta 阈值、能力矩阵与站点深度
- [ ] 实现 coverage matrix 计算逻辑
- [ ] 让 JSON / Markdown 报告输出 coverage summary 与 Beta gate

## Task 2: 为 registry 增加稳定能力元数据

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/registry/sites.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/README.md`

- [ ] 为现有场景补 `metadata.capabilities`
- [ ] 在 README 中说明 Beta coverage 的能力类目与门禁含义
- [ ] 把新增场景并入对应站点 manifest

## Task 3: 扩展 The Internet 与 UI Testing Playground

**Files:**
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/the-internet/checkboxes-toggle.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/the-internet/dynamic-controls-state.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/the-internet/entry-ad-close.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/ui-testing-playground/progressbar-stop.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/ui-testing-playground/dynamic-table-cpu.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/ui-testing-playground/shadowdom-guid.js`

- [ ] 为这两个站点补异步等待、状态切换、Shadow DOM、模态等场景

## Task 4: 扩展 Expand Testing、QA Playground、DemoQA、ParaBank

**Files:**
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/expand-testing/dynamic-pagination-table.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/expand-testing/shadowdom-extraction.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/qa-playground/alerts-dialogs-toast.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/qa-playground/radio-checkbox-states.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/demoqa/radio-button-selection.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/parabank/transfer-funds.js`

- [ ] 为这些站点补分页、Shadow DOM、toast/modal、单选复选、多页资金流等能力场景
- [ ] 如果 live site 不稳定，选择同站点同等级替代场景，但不要降级为 fake fixture

## Task 5: 运行、修复与 review 收口

**Files:**
- Modify: 与失败场景、registry 或 coverage 逻辑直接相关的文件

- [ ] 运行 `npm run benchmark:test`
- [ ] 运行 `npm run benchmark:list`
- [ ] 运行 `npm run benchmark`
- [ ] 运行 `node --test`
- [ ] 做 `gpt-5.4 high` code review，修复，再 review，直到没有重大问题
