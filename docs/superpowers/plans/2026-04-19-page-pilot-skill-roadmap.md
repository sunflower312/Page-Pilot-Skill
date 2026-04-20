# Page Pilot Skill 落地计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Page Pilot Skill` 收口为一个契约清晰、文档一致、对 Codex 友好的 Playwright 代码生成辅助工具，而不是缩小版 Agent Browser。

**Architecture:** 先锁死公共工具契约，再同步文档、仓库入口、benchmark 指标与开发体验，最后拆分实现结构并清理旧残留。整个改造围绕 `scan/analyze -> locator ranking -> bounded validation -> code generation -> verification/repair` 主闭环展开。

**Tech Stack:** Node.js、Playwright、MCP SDK、Zod、Markdown 文档、真实站点 benchmark。

---

## 总体要求

- 所有 phase 都必须使用 repo-relative 路径。
- 所有公共能力必须以工具契约为准，不允许继续靠 `SKILL.md` 文案补语义。
- 不再保留 deprecated / 兼容旧 agent 工具的过渡层。
- benchmark 的门禁目标是代码质量，不是代理任务完成率。
- 若某个功能只服务 benchmark 或内部调试，必须在文档和代码层显式标明“内部使用”，不得冒充公共能力。

## Phase 1：锁死公共工具契约

**Files:**
- Modify: `docs/superpowers/specs/2026-04-19-page-pilot-skill-design.md`
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/SKILL.md`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/references/locator-strategy.md`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/references/workflows.md`
- Modify: `plugins/page-pilot-skill/benchmarks/README.md`

**Deliverables:**
- 公共工具清单
- 工具级输入/输出样例清单
- 内部工具清单
- 删除工具清单
- 文档与实现漂移清单

- [x] 明确公共工具只保留 `browser_open`、`browser_scan`、`browser_rank_locators`、`browser_probe`、`browser_validate_playwright`、`browser_generate_playwright`、`browser_repair_playwright`、证据工具与 `browser_close`
- [x] 在 `mcp-server.js` 中枚举并核对当前实际公开工具，删除所有不再属于主线的旧 agent 工具入口
- [x] 处理 `browser_validate_playwright_code`：要么删除，要么改成内部 gated 能力；不得继续作为未说明边界的公共工具暴露
- [x] 为每个保留的公共工具写清输入示例、输出示例和“不该用在什么场景”
- [x] 让 `SKILL.md`、参考文档、benchmark README 和 MCP 描述只引用同一套工具口径
- [x] 修正文档中的工具数量与名称漂移，确保 `SKILL.md`、公共契约和实际工具注册一致
- [x] 处理 `storage state` 叙事漂移：要么补正式保存工具并写入契约，要么从公共文档中移除“可保存复用”的承诺

## Phase 2：重做 scan/analyze 契约

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/semantic-model.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`
- Create: `docs/contracts.md` or `docs/tools/browser-scan.md`

**Deliverables:**
- `browser_scan` result schema
- 页面级对象 schema
- 元素级对象 schema
- `stableFingerprint` 说明

- [x] 把 `browser_scan` 明确定义为页面语义对象模型，而不是“增强 DOM 扫描”
- [x] 在契约里显式区分 `accessibleName`、`visibleText`、`description`、`state`、`actionability`、`localContext`、`geometry`、`recommendedLocators`、`stableFingerprint`、`confidence`
- [x] 在文档里明确这些字段的边界，避免 `aria/text/label/placeholder` 混用
- [x] 为 schema 补测试，锁住字段拆分和序列化行为
- [x] 在公共文档中加入 scan 输出示例

## Phase 3：统一 locator ranking 规则与文档

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-ranking.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-candidates.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-runtime.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/playwright-generator.js`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/references/locator-strategy.md`
- Modify: `plugins/page-pilot-skill/tests/unit/semantic-target-ranking.test.js`
- Create: `docs/tools/browser-rank-locators.md` or equivalent contract section

**Deliverables:**
- locator ranking schema
- ranking reason schema
- CSS fallback policy
- 文档与实现一致性核对清单

- [x] 以 Playwright 语义 locator 为中心重写并锁定排序规则
- [x] 明确默认偏好为 `role -> label -> testId -> text -> placeholder -> css`，同时说明这是候选质量排序而非死板字段顺序
- [x] 为每个推荐 locator 输出 `playwrightExpression`、`matchCount`、`stabilityReason`、`fallbackReason`、`confidence`
- [x] 修正文档中所有与实现不一致的 locator 顺序描述
- [x] 补测试，防止文档和实现再次漂移

## Phase 4：收紧 probe 和验证边界

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/script-execution.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/probe-templates.js`
- Delete: `plugins/page-pilot-skill/scripts/lib/playwright-code-execution.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/playwright-validation.js`
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `plugins/page-pilot-skill/tests/unit/script-execution.test.js`
- Delete: `plugins/page-pilot-skill/tests/unit/playwright-code-execution.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/mcp-server.test.js`
- Create: `docs/tools/browser-probe.md`
- Create: `docs/tools/browser-validate-playwright.md`

**Deliverables:**
- `browser_probe` tool contract
- `browser_validate_playwright` contract
- 验证计划 schema
- 内部脚本执行 policy

- [x] 确保 `browser_probe` 默认只读、超时受限、返回值受限，不再被用作通用脚本执行器
- [x] 把公共验证路径改成只消费结构化验证计划或 `generatedPlan`
- [x] 让任何需要执行原始代码字符串的能力只存在于内部基准或调试路径，并通过 gate 隔离
- [x] 在文档中明确区分“公共验证”与“内部调试”
- [x] 补测试，锁住公共工具不能重新退化成任意执行入口

## Phase 5：重写 code generation 与 repair 契约

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/playwright-generator.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/playwright-validation.js`
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Modify: `plugins/page-pilot-skill/tests/unit/playwright-generator.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/mcp-server.test.js`
- Create: `docs/tools/browser-generate-playwright.md`
- Create: `docs/tools/browser-repair-playwright.md`

**Deliverables:**
- `browser_generate_playwright` input/output schema
- `browser_repair_playwright` input/output schema
- validation result schema
- codegen warning schema

- [x] 让 codegen 明确基于语义候选、排序结果和 validation evidence 生成
- [x] 停止把“成功动作回放”作为 codegen 的主解释模型
- [x] 把 repair 限制为候选重排、locator 更换、等待修正和 assertion 修正
- [x] 在公共文档里补齐 `generatedPlan`、`locatorChoices`、`fallbackLocatorChoices` 等字段说明
- [x] 为生成后验证和修复补足结构化输出示例

## Phase 6：补齐仓库入口与对外文档

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `docs/architecture.md`
- Create: `docs/development.md`
- Create or Modify: `docs/contracts.md` or `docs/tools/*.md`
- Modify: `plugins/page-pilot-skill/.codex-plugin/plugin.json`

**Deliverables:**
- 顶层 README
- MIT LICENSE
- architecture 文档
- development 文档
- 契约文档入口
- 仓库边界说明

- [x] 编写顶层 `README.md`，说明一句话定位、安装方式、最短使用路径和目录结构
- [x] 增加真正的 `LICENSE` 文件，并与插件元数据中的 MIT 声明一致
- [x] 编写 `docs/architecture.md`，解释 Skill、MCP server、benchmark 三层关系
- [x] 在 `docs/architecture.md` 中写清 `.agents/plugins/marketplace.json`、`.codex-plugin/plugin.json` 与 `skills/` 的边界和用途
- [x] 编写 `docs/development.md`，说明 Node 版本、Playwright 浏览器依赖、测试矩阵和常见故障
- [x] 将 `.codex-plugin/plugin.json` 中的 `privacyPolicyURL` 与 `termsOfServiceURL` 从仓库首页占位替换为真实文档地址或明确说明

## Phase 7：修正开发体验与测试入口

**Files:**
- Modify: `plugins/page-pilot-skill/package.json`
- Modify: `plugins/page-pilot-skill/tests/integration/*.test.js`
- Modify: `plugins/page-pilot-skill/tests/unit/*.test.js`
- Create: `plugins/page-pilot-skill/scripts/doctor.js` or `scripts/setup.js`
- Modify: `docs/development.md`

**Deliverables:**
- 新的测试脚本策略
- `setup` / `doctor` 命令
- 浏览器依赖检测逻辑
- 开发体验说明

- [x] 调整 `npm test`，避免新环境因未安装 Chromium 而直接红
- [x] 决定并实现其中一种策略：默认只跑单元测试，或缺少浏览器时自动跳过 integration
- [x] 增加 `npm run setup` 或 `npm run doctor`
- [x] 明确写出各测试命令适用范围
- [x] 扩大 lint 覆盖范围，不再只检查单个入口文件

## Phase 8：拆分中心化大模块

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/mcp-server.js`
- Create: `plugins/page-pilot-skill/scripts/schemas/`
- Create: `plugins/page-pilot-skill/scripts/tools/`
- Create or Modify: scan runtime resource files
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-ranking.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/semantic-target-ranking.js`

**Deliverables:**
- `schemas/` 目录
- `tools/` 目录
- server entry
- scan runtime extraction
- locator expression single-source module

- [x] 将 `mcp-server.js` 拆为 `schemas/`、`tools/`、`server.js`
- [x] 把浏览器侧 scan runtime 从 `structured-scan.js` 中抽离
- [x] 把 locator 到 Playwright expression 的逻辑收成唯一来源模块
- [x] 重新命名易混淆模块，例如区分排序逻辑与工具包装逻辑
- [x] 用测试锁住拆分后契约不变

## Phase 9：清理旧 Agent Browser 残留

**Files:**
- Modify: `plugins/page-pilot-skill/tests/fixtures/*`
- Modify: `plugins/page-pilot-skill/tests/integration/*`
- Modify: `plugins/page-pilot-skill/scripts/lib/browser-manager.js`
- Modify: `plugins/page-pilot-skill/artifact path references as needed`
- Modify: branding references across repo

**Deliverables:**
- 旧命名清理清单
- 旧状态字段清理清单
- 路径与品牌一致性检查结果

- [x] 清理 fixture 中的旧 `Agent Browser` 命名
- [x] 清理 integration 中仍然硬编码的旧 artifact 路径
- [x] 清理 `browser-manager.js` 等内部仍保留的旧代理状态字段
- [x] 跑一次全仓库关键字检查，确认品牌和旧模块叙事已经统一

## Phase 10：把 benchmark 彻底收口到代码质量

**Files:**
- Modify: `plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/coverage-matrix.js`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/report-writer.js`
- Modify: `plugins/page-pilot-skill/benchmarks/registry/sites.js`
- Modify: `plugins/page-pilot-skill/benchmarks/scenarios/**/*`

**Deliverables:**
- benchmark metric schema
- benchmark report schema
- code-quality gate definition
- internal-only benchmark capability policy

- [x] 让 benchmark 报告直接体现语义 locator 占比、CSS fallback 占比、首次验证通过率、修复后通过率、代码长度和唯一命中率
- [x] 把“agent 长流程完成率”从 benchmark 主目标中彻底移除
- [x] 明确哪些 benchmark 辅助能力属于内部专用，不纳入公共契约
- [x] 为每类代码质量指标补断言，避免以后回退成“只要场景能跑完就算通过”

## Phase 11：统一公共 envelope 与契约示例测试

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/tools/analysis-tools.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/playwright-tools.js`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.js`
- Modify: `plugins/page-pilot-skill/benchmarks/scenarios/_shared/scenario-tools.js`
- Modify: `docs/contracts.md`
- Modify: `docs/tools/browser-scan.md`
- Modify: `docs/tools/browser-rank-locators.md`
- Test: `plugins/page-pilot-skill/tests/unit/public-contracts.test.js`
- Test: `plugins/page-pilot-skill/tests/unit/scenario-tools.test.js`

**Deliverables:**
- 顶层 envelope 统一规则
- 关键工具示例 JSON 契约测试
- benchmark helper 的工具失败/业务失败边界

- [x] 统一 `browser_scan`、`browser_rank_locators`、`browser_validate_playwright`、`browser_repair_playwright` 的顶层 `ok` 语义
- [x] 让 benchmark helper 只把真正的工具失败当成异常抛出，不再误把业务失败当成工具失败
- [x] 修正 `docs/contracts.md` 与 `docs/tools/*.md` 中关键公共工具的示例漂移
- [x] 为 `browser_scan` 和 `browser_rank_locators` 增加示例 JSON 解析与关键字段快照测试

## Phase 12：推进 browser_scan v3

**Files:**
- Reference: `docs/superpowers/specs/2026-04-20-browser-scan-v3-design.md`
- Reference: `docs/superpowers/plans/2026-04-20-browser-scan-v3-plan.md`

**Deliverables:**
- `scan.v3`
- provenance
- role-based detection
- `summary.coverage`
- `specializedControls`
- scan-level 轻量验证
- 第一版 `collections`

- [x] 按 `browser_scan v3` 专项 spec/plan 推进实现

## Phase 13：最后一轮 DX 与旧命名收尾

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/doctor.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/action-stability.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/stability-wait.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/observation.js`
- Modify: `plugins/page-pilot-skill/tests/unit/observation.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`

**Deliverables:**
- 增强版 `doctor`
- 旧内部命名清理
- DX 收尾检查清单

- [x] 增强 `doctor`，至少补 `mcp-server`、Codex CLI、插件目录与安装脚本的基础检查
- [x] 清理 `__agentBrowser*` 一类旧内部命名，统一为 `pagePilot*`
- [x] 跑一次关键字检查，确认旧命名只保留在历史 benchmark 产物或明确允许的历史文档中

## 验收标准

- [x] 公开工具面已锁死，且只有一套文档口径
- [x] `browser_validate_playwright_code` 已删除、内收或被结构化验证替代
- [x] `browser_scan` 契约已升格为稳定的语义对象模型
- [x] locator ranking 规则在实现、Skill 文案和参考文档中完全一致
- [x] 顶层 `README.md`、`LICENSE`、`docs/architecture.md`、`docs/development.md` 已补齐
- [x] 新环境运行 `npm test` 不会因为浏览器未安装直接红
- [x] `mcp-server.js` 与 `structured-scan.js` 已开始按边界拆分
- [x] 仓库内旧 Agent Browser 命名和旧状态噪音已清理
- [x] benchmark 主指标已完整改成代码质量指标
- [x] 顶层 envelope 语义在所有公共工具中统一
- [x] 关键公共工具的文档示例进入自动测试
- [x] role fallback 一致性有测试锁住
- [x] `browser_scan v3` 已按专项计划落地
- [x] `doctor` 与最后一轮旧命名收尾完成
