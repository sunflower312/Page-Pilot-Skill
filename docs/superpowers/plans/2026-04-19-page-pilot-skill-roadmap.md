# Page Pilot Skill 落地计划

## Goal

把 `page-pilot-skill` 落地为一个**代码生成辅助工具**，而不是缩小版 Agent Browser。后续开发必须围绕固定主闭环展开：

`scan/analyze -> locator ranking -> interaction validation -> code generation -> generated-code verification/repair`

## Architecture

以页面语义对象模型为中心，把工具面、代码生成、验证链路和 benchmark 全部收口到“帮助模型写出更可靠 Playwright 代码”这一目标上。旧的代理式工具和模块不保留兼容层，直接删除。

## Phase 1: 收紧入口叙事与工具契约

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/SKILL.md`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/agents/openai.yaml`
- Modify: `plugins/page-pilot-skill/agents/openai.yaml`
- Modify: `plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `AGENTS.md`

**Deliverables:**
- 主闭环文案统一稿
- MCP 主工具清单
- 删除工具清单
- `browser_probe` / `browser_validate_playwright` / `browser_repair_playwright` 契约草案

- [x] 将所有入口文案统一为 `scan/analyze -> locator ranking -> interaction validation -> code generation -> generated-code verification/repair`
- [x] 从 spec、plan、skill、MCP 描述中移除 agent / orchestration / long-running workflow 叙事
- [x] 在 `mcp-server.js` 中写清新的主工具集合
- [x] 明确旧工具直接删除，不写 deprecated 或兼容说明

## Phase 2: 定义语义对象模型与 scan schema

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/semantic-model.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/unit/semantic-model.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`

**Deliverables:**
- `browser_scan` result schema
- 元素级语义对象模型
- `stableFingerprint` schema
- `confidence` schema

- [x] 将 `browser_scan` 输出定义为页面语义对象模型，而不是增强 DOM 扫描
- [x] 显式拆出 `accessibleName`、`visibleText`、`description`、`state`、`actionability`、`localContext`、`geometry`、`recommendedLocators`、`stableFingerprint`、`confidence`
- [x] 让 scan 输出适合模型直接消费，而不是要求模型二次拼装
- [x] 为 schema 增加测试，防止字段再次退化为混合文本字段

## Phase 3: 重构 locator ranking

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-candidates.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-runtime.js`
- Create: `plugins/page-pilot-skill/scripts/lib/locator-ranking.js`
- Modify: `plugins/page-pilot-skill/tests/unit/interactive-priority.test.js`
- Modify: `plugins/page-pilot-skill/tests/unit/semantic-model.test.js`

**Deliverables:**
- locator ranking result schema
- ranking reason schema
- CSS fallback policy

- [x] 新增明确的 ranking 模块，不再用字段优先级隐式代替排序规则
- [x] 以 Playwright 语义 locator 为中心排序
- [x] 去掉固定 `testId-first`
- [x] 为每个推荐 locator 输出命中数、稳定性原因、降级原因和置信度
- [x] 写清 CSS fallback 只能是最后选项

## Phase 4: 用只读 probe 取代任意脚本执行

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/script-execution.js`
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Create: `plugins/page-pilot-skill/scripts/lib/probe-templates.js`
- Modify: `plugins/page-pilot-skill/tests/unit/script-execution.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/mcp-server.test.js`

**Deliverables:**
- `browser_probe` tool contract
- probe request schema
- probe response schema
- 只读边界说明

- [x] 删除 `browser_execute_js`
- [x] 新增 `browser_probe`
- [x] 只允许只读、可序列化、超时受限探针
- [x] 预置少量高价值 probe 模板，而不是默认放开任意脚本
- [x] 用测试锁住只读边界

## Phase 5: 重写 code generation 契约

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/playwright-generator.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/assertion-text.js`
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `plugins/page-pilot-skill/tests/unit/playwright-generator.test.js`

**Deliverables:**
- `browser_generate_playwright` session-based input schema
- `browser_generate_playwright` output schema
- codegen warning schema

- [x] 让 codegen 以“语义候选 + 排序结果 + 已验证信息”为输入
- [x] 停止从成功动作回放直接还原代码
- [x] 输出 locator 选择理由、fallback 选择和 assertion 计划
- [x] 输出 `generatedPlan` 供生成后复验使用
- [x] 默认生成更短、更语义化的 Playwright 代码

## Phase 6: 建立验证与修复工具

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/action-runner.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/observation.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/action-stability.js`
- Create: `plugins/page-pilot-skill/scripts/lib/playwright-validation.js`
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `plugins/page-pilot-skill/tests/unit/action-runner.test.js`
- Modify: `plugins/page-pilot-skill/tests/unit/action-stability.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`

**Deliverables:**
- `browser_validate_playwright` tool contract
- validation result schema
- `browser_repair_playwright` tool contract
- repair result schema

- [x] 删除 `browser_run_actions` 作为主路径
- [x] 将必要的真实动作验证能力收进 `browser_validate_playwright`
- [x] 验证 locator 是否唯一命中、元素是否可交互、动作后是否有预期状态变化、assertion 是否通过
- [x] 新增 `browser_repair_playwright`，只允许有限修复：候选重排、locator 更换、等待修正、assertion 修正
- [x] 让验证和修复结果结构化输出，供模型继续决策

## Phase 7: 删除旧代理模块

**Files:**
- Delete: `plugins/page-pilot-skill/scripts/lib/goal-orchestrator.js`
- Delete: `plugins/page-pilot-skill/scripts/lib/goal-planner.js`
- Delete: `plugins/page-pilot-skill/scripts/lib/strategy-report.js`
- Delete: `plugins/page-pilot-skill/scripts/lib/strategy-state.js`
- Delete: `plugins/page-pilot-skill/scripts/lib/site-intelligence-store.js`
- Delete: `plugins/page-pilot-skill/scripts/lib/workflow-intelligence.js`
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `plugins/page-pilot-skill/tests/**`

**Deliverables:**
- 删除清单
- 删除后工具面说明
- 删除后测试更新清单

- [x] 从代码中直接删除旧代理模块
- [x] 删除相关 MCP 工具入口
- [x] 删除或重写依赖这些模块的测试
- [x] 确保主线代码不再引用旧代理模块

## Phase 8: 把 benchmark 改成代码质量基准

**Files:**
- Modify: `plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/coverage-matrix.js`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/report-writer.js`
- Modify: `plugins/page-pilot-skill/benchmarks/registry/sites.js`
- Modify or Create as needed under: `plugins/page-pilot-skill/benchmarks/scenarios/`

**Deliverables:**
- benchmark metric schema
- benchmark report schema
- code quality gate definition
- external site unavailable policy

- [x] 将 benchmark 指标改为语义 locator 占比、CSS fallback 占比、唯一命中率、已验证计划首次通过率、生成计划验证通过率、修复后通过率、代码长度
- [x] 删除以“agent 完成长流程任务”为主的成功标准
- [x] 为每个真实站点场景增加 codegen 质量断言
- [x] 在失败路径也落盘 code-quality 与 generated-code 证据
- [x] 将外部站点不可用显式标记为 `EXTERNAL_SITE_UNAVAILABLE`，并从验收与 code-quality 分母中剔除
- [x] 让 benchmark 报告能直接说明代码质量是否提升

## Acceptance Criteria

- [x] 文档、skill、agent 配置、MCP 描述全部只讲代码生成辅助闭环
- [x] MCP 工具面只保留主工具，不再保留旧 agent 工具
- [x] `browser_scan` 已升级为明确的语义对象模型
- [x] locator ranking 已明确以 Playwright 语义 locator 为中心
- [x] 任意脚本执行已被 `browser_probe` 替代
- [x] codegen 已基于语义候选和验证结果生成
- [x] 验证与修复工具可在真实页面上闭环工作
- [x] benchmark 已改成代码质量基准
