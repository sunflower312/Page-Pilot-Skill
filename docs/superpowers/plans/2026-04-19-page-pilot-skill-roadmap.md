# Page Pilot Skill 落地计划

## Goal

把 `page-pilot-skill` 从“通用 headless 浏览器代理”收口为“帮助模型编写更可靠 Playwright / 网页自动化代码的语义辅助工具”，并以此作为后续开发主线。

## Architecture

以 `scan / analyze -> locator ranking -> code generation -> validation / repair -> benchmark` 为主干。保留必要的真实动作验证能力，但不再继续优先扩张长期自主执行、站点记忆和复杂规划能力。

## Phase 1: 收口产品面与 MCP 工具面

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/skills/page-pilot-skill/SKILL.md`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `/data/work/AgentBrowser/AGENTS.md`

- [ ] 将核心能力定义为 `scan / analyze`、locator 排序、代码生成、生成后验证
- [ ] 把 `browser_execute_js` 明确降级为受控只读探针方向
- [ ] 将 `browser_strategy_report`、`browser_explore_goal` 标记为非核心，不再作为主线演进入口
- [ ] 更新 skill 与项目文档，使描述与新定位一致

## Phase 2: 升级 scan / analyze 数据模型

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/structured-scan.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/semantic-model.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/interactive-priority.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/unit/*.test.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration/*.test.js`

- [ ] 让高价值候选元素默认带上 ARIA / accessibility 优先的语义字段
- [ ] 补齐元素状态、局部上下文、geometry、stable fingerprint
- [ ] 明确“局部容器上下文”，例如 form / dialog / table / heading
- [ ] 控制输出体量，确保结果仍适合模型消费

## Phase 3: 重构 locator ranking

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/locator-candidates.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/locator-runtime.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/unit/*.test.js`

- [ ] 把排序从“字段优先级”升级为“语义强度 + 唯一性 + 稳定性 + 可读性”
- [ ] 默认优先高质量 `getByRole` / `getByLabel`
- [ ] 让 `testId` 作为强候选而不是写死的全局第一名
- [ ] 为 CSS fallback 建立显式降级理由

## Phase 4: 生成受控只读 probe

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/script-execution.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/mcp-server.js`
- Create or Modify as needed under: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/`

- [ ] 将任意脚本执行重构为默认只读 probe 模式
- [ ] 提供少量高价值内置 probe 模板
- [ ] 允许在确有必要时显式使用更低级能力，但默认不暴露为主路径

## Phase 5: 重构 Playwright code generation

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/playwright-generator.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/assertion-text.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/unit/playwright-generator.test.js`

- [ ] 让 codegen 直接消费更丰富的语义候选信息
- [ ] 默认产出更语义化、更短的 Playwright 代码
- [ ] 在必要时保留明确的降级说明
- [ ] 让 assertion 与动作表达更贴近真实页面语义

## Phase 6: 增加生成后验证 / 修复

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/action-runner.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/observation.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/action-stability.js`
- Create or Modify as needed under: `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/unit/*.test.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/tests/integration/*.test.js`

- [ ] 校验生成 locator 是否可命中、是否唯一、是否可交互
- [ ] 校验动作后是否出现预期状态变化
- [ ] 增加有限修复链路：重排候选、降级 locator、修正 assertion 或等待
- [ ] 输出“首轮通过 / 修复后通过 / 无法修复”的结构化结果

## Phase 7: Benchmark 重构为代码质量基准

**Files:**
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/coverage-matrix.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/lib/report-writer.js`
- Modify: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/registry/sites.js`
- Modify or Create as needed under: `/data/work/AgentBrowser/plugins/page-pilot-skill/benchmarks/scenarios/`

- [ ] 将 benchmark 指标改为“代码是否更稳、更短、更语义化、更少脆弱 locator”
- [ ] 为真实站点场景补 codegen 质量断言
- [ ] 增加生成后验证与修复通过率统计
- [ ] 将自主任务式成功标准降级为辅助参考，不再作为主门禁

## Phase 8: 降级或冻结非核心代理模块

**Files:**
- Modify or Delete as needed:
  - `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/goal-orchestrator.js`
  - `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/goal-planner.js`
  - `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/strategy-report.js`
  - `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/strategy-state.js`
  - `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/site-intelligence-store.js`
  - `/data/work/AgentBrowser/plugins/page-pilot-skill/scripts/lib/workflow-intelligence.js`

- [ ] 标记哪些模块保留兼容、哪些模块冻结、哪些模块后续删除
- [ ] 确保这些模块不再主导 benchmark 和产品叙事
- [ ] 收紧测试与文档，使主线只围绕语义辅助与代码生成

## Acceptance Criteria

- [ ] 项目公开定位已收口为“语义辅助式 Playwright 代码生成工具”
- [ ] `scan / analyze` 输出模型覆盖 accessibility / DOM / layout / text 语义
- [ ] locator 排序显著偏向语义化 Playwright locator
- [ ] 生成后验证 / 修复能力可用
- [ ] benchmark 明确衡量代码生成质量而非代理任务完成率
- [ ] 非核心代理能力被降级或冻结，不再继续占据主线优先级
