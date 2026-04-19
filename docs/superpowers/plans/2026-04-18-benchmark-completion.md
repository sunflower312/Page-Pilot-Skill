# Benchmark Completion Implementation Plan

> 2026-04-19 定位更新：本计划中的站点和场景补全现在优先服务代码生成质量 benchmark，而不是通用 agent 式任务完成 benchmark。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `page-pilot-skill` 的真实 benchmark 扩展成覆盖全部相关公开练习站点和核心能力面的本地完整验收套件。

**Architecture:** 在现有 `benchmarks/` 框架上补齐 registry、共享 helper 和站点场景目录。默认 `npm run benchmark` 跑全部稳定场景，低层机制测试继续留在 `node --test` 路径内。

**Tech Stack:** Node.js ESM、Playwright、MCP server、真实公开练习 / demo 站点

---

## Task 1: 扩展 benchmark contract 与覆盖约束

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/scenario-helpers.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.check.js`

- [x] 为 site / scenario 补能力标签、默认执行说明和更清晰的报告字段
- [x] 补 benchmark 自检，约束目标站点全部在 registry 中且不再停留在旧的 pending / excluded 决策
- [x] 让 README 和报告格式反映“完整本地验收”定位

## Task 2: 补齐 registry 站点与场景矩阵

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/registry/sites.js`

- [x] 把 ToScrape、Scrape This Site、Web Scraper Test Sites、TryScrapeMe、The Internet、UI Testing Playground、Expand Testing、QA Playground、RPA Challenge、DemoQA、ParaBank 全部纳入
- [x] 为每个站点定义 2 到 4 个与目标相关的场景
- [x] 只对确有外部阻塞的页面做明确降级，不保留“历史遗留 pending”

## Task 3: 补共享 helper

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/_shared/scenario-tools.js`
- Create or Modify as needed under: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/_shared/`

- [x] 评估共享 helper 缺口并确认现有 `scenario-tools` 足以支撑本轮实现
- [x] 将复杂站点差异收敛在各场景文件内部，避免无必要地扩张共享层

## Task 4: 扩容现有已纳入站点

**Files:**
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/toscrape/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/scrape-this-site/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/web-scraper-test-sites/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/tryscrapeme/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/ui-testing-playground/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/expand-testing/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/qa-playground/*`

- [x] 为这些站点补齐多场景覆盖
- [x] 确保每个场景都有明确步骤、预期结果、失败模式和结构化断言
- [x] 避免继续依赖猜测 URL 或已经失效的路径

## Task 5: 纳入剩余站点

**Files:**
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/the-internet/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/rpa-challenge/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/demoqa/*`
- Modify or Create: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/parabank/*`

- [x] 把 The Internet 从旧的 outage 决策恢复为真实场景覆盖
- [x] 为 RPA Challenge 实现至少一个动态字段映射场景
- [x] 为 DemoQA 和 ParaBank 各自补齐稳定代表场景

## Task 6: 运行、修复与 review 收口

**Files:**
- Modify: 与失败场景直接相关的 benchmark 文件

- [x] 运行 `npm run benchmark:test`
- [x] 运行 `npm run benchmark:list`
- [x] 运行 `npm run benchmark`
- [x] 修复默认 benchmark 失败直到通过
- [ ] 做 `gpt-5.4 high` review，修复，再 review，直到没有重大问题
