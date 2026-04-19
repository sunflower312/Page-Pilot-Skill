# Real Benchmark Framework Implementation Plan

> 2026-04-19 定位更新：本计划对应的 benchmark 框架现在服务于语义辅助式 Playwright 代码生成主线，重点是页面理解、locator 质量和代码生成验证，不再作为通用浏览器代理路线的验收依据。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `page-pilot-skill` 建立真实站点 benchmark 验收框架，移除本地构造流程页的验收角色，并完成一次真实 benchmark 执行。

**Architecture:** 通过独立的 `benchmarks/` 目录组织站点 manifest、场景实现、通用任务函数、runner 和报告输出。benchmark 以本地 MCP server 为黑盒被测系统，通过真实公开练习 / 演示站点执行能力验收，不进入 `node --test` 默认路径。

**Tech Stack:** Node.js ESM、Playwright、@modelcontextprotocol/sdk、现有 `page-pilot-skill` MCP server

---

## File Map

- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-client.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/report-writer.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/scenario-helpers.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/registry/sites.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/tasks/`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/README.md`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/run-benchmarks.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/package.json`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration/mcp-server.test.js`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration/goal-exploration.test.js`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-login.html`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-dashboard.html`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-lesson.html`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-disabled.html`

### Task 1: 搭建 benchmark runner 与报告骨架

**Files:**
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-client.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/report-writer.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/run-benchmarks.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/package.json`

- [ ] 定义 benchmark CLI 参数模型，支持 `--site`、`--scenario`、`--all`
- [ ] 实现本地 MCP 客户端包装，统一 `browser_open`、`browser_scan`、`browser_run_actions`、`browser_execute_js`、`browser_capture_screenshot`、`browser_close`
- [ ] 实现 benchmark runner，支持站点过滤、场景过滤、错误汇总与执行计时
- [ ] 实现报告写入器，输出 `summary.json`、站点级 JSON 和 Markdown 报告
- [ ] 在 `package.json` 增加 `benchmark` script

### Task 2: 建立站点 manifest 与通用任务函数

**Files:**
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/registry/sites.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/scenario-helpers.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/tasks/extraction-tasks.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/tasks/automation-tasks.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/tasks/stateful-flow-tasks.js`

- [ ] 为首批真实站点建立 manifest，包含官方用途声明证据与默认场景
- [ ] 实现分页抽取、表格抽取、AJAX 等待、登录流、多步骤状态流等任务函数
- [ ] 统一场景返回格式，包含步骤、预期、失败模式、断言与 artifact

### Task 3: 接入首批真实站点场景

**Files:**
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/toscrape.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/scrape-this-site.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/web-scraper-test-sites.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/try-scrape-me.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/the-internet.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/ui-testing-playground.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/expand-testing.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/qa-playground.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/parabank.js`
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/demoqa.js`

- [ ] 为每个站点实现至少一个代表性场景
- [ ] 每个场景都明确记录“站点 -> 场景 -> 步骤 -> 预期结果 -> 失败模式 -> 可执行测试代码”
- [ ] 对暂不启用的复杂站点，如 `RPA Challenge`，在 registry 中保留但标记为 `pending`

### Task 4: 移除构造流程 benchmark 地位

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration/mcp-server.test.js`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration/goal-exploration.test.js`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-login.html`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-dashboard.html`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-lesson.html`
- Delete: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/fixtures/goal-disabled.html`

- [ ] 删除依赖 `goal-*` fixture 的集成测试
- [ ] 保留不依赖 fake business flow 的机制测试
- [ ] 确保 MCP 与 planner 的单元测试仍然覆盖核心 contract

### Task 5: 文档、验证与真实 benchmark 执行

**Files:**
- Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/package.json`

- [ ] 编写 benchmark README，说明合规原则、运行方式、输出位置与站点清单
- [ ] 跑 `node --test`，确保现有测试在清理后仍通过
- [ ] 跑至少一次 benchmark，例如 `npm run benchmark -- --all`
- [ ] 保存 benchmark 报告路径与主要结果
- [ ] 完成代码 review 与修复循环，直到没有大的正确性问题

## Self-Review Checklist

- 本计划覆盖了框架、manifest、场景接入、旧测试清理与最终验证
- 没有留 `TODO`、`TBD` 或“后面补”型占位
- benchmark 与默认测试路径边界清晰，没有要求把真实外网站点塞进 `node --test`
