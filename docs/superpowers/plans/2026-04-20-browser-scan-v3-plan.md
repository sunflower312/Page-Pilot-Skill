# browser_scan v3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `browser_scan` 升级为 `scan.v3`，在不破坏 `Page Pilot Skill` 主闭环的前提下，提升复杂组件页覆盖面、语义来源透明度、扫描预算可解释性与局部验证能力。

**Architecture:** 继续沿用 `analysis-tools -> structured-scan -> structured-scan-runtime -> structured-scan-shaping` 的分层链路。先统一公共 envelope 和示例契约，再分阶段增强运行时采集、shaping、轻验证和 collection 摘要，避免把 scan 做成重型验证器或代理工具。

**Tech Stack:** Node.js、Playwright、MCP server、现有 `structured-scan` 运行时、Markdown 契约文档、unit/integration tests、benchmark self-check。

---

## 总体约束

- 所有实现必须遵守公共 envelope 统一规则：顶层 `ok` 仅表示工具调用成功与否。
- 不允许通过 `browser_scan v3` 引入任意脚本执行或重型全量验证。
- 不允许破坏现有主 `interactives` 分组。
- `specializedControls` 先作为扩展区存在，不得默认混入主 `interactives`。
- 新示例文档必须配套自动测试，避免文档与实现再次漂移。

## Phase 0：收紧前置契约与边界

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/tools/analysis-tools.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/locator-choices.js`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.js`
- Modify: `plugins/page-pilot-skill/benchmarks/scenarios/_shared/scenario-tools.js`
- Modify: `docs/contracts.md`
- Modify: `docs/tools/browser-scan.md`
- Test: `plugins/page-pilot-skill/tests/unit/public-contracts.test.js`
- Test: `plugins/page-pilot-skill/tests/unit/scenario-tools.test.js`

**Deliverables:**
- 统一的 success/failure envelope 规则
- `browser_scan` 文档示例更新为真实 envelope
- benchmark helper 对“工具失败”与“业务失败”区分明确
- 契约示例 JSON 校验入口

- [x] 统一 `browser_scan`、`browser_rank_locators` 成功时的顶层 envelope，确保工具成功时一律 `ok: true`
- [x] 清理 `docs/tools/browser-scan.md` 和 `docs/contracts.md` 中与真实 envelope 不一致的示例
- [x] 检查 benchmark helper 是否仍把业务层失败误当成工具失败，必要时修正
- [x] 为 `browser_scan` 文档示例新增 JSON 可解析测试或快照测试
- [x] 为 `docs/contracts.md` 中 `browser_scan` 示例新增结构快照测试

## Phase 1：运行时采集扩面与 provenance 引入

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-runtime.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-shaping.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/analysis-tools.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`
- Modify: `docs/tools/browser-scan.md`

**Deliverables:**
- `scan.v3` 页面和元素级 schema
- `provenance` 字段
- role-based detection
- Shadow DOM 扩 coverage
- `summary.coverage`

- [x] 将 `browser_scan` 输出 `schemaVersion` 从 `scan.v2` 升级为 `scan.v3`
- [x] 在 `structured-scan-runtime.js` 中为 `role / name / label / description` 引入带来源的采集 helper
- [x] 在主文档采集阶段增加 ARIA role-based interactive detection，覆盖常见 widget role
- [x] 在 Shadow DOM 采集中补齐 `a[href]` 和 role-based widget
- [x] 让 `structured-scan-shaping.js` 为 retained entry 增加 `id`、`provenance`、`origin`
- [x] 新增 `summary.coverage`，输出 discovered / retained / omitted / budget
- [x] 更新 `browser-scan.md` 的 `scan.v3` 示例与字段说明
- [x] 补 unit/integration 测试，覆盖 provenance、role-based widget、Shadow DOM 扩面与 coverage

## Phase 2：扩展控件与 focus 倾斜

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-runtime.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-shaping.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/interactive-priority.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/analysis-tools.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`
- Modify: `docs/tools/browser-scan.md`

**Deliverables:**
- `focus` 输入契约
- `specializedControls` 输出契约
- 预算倾斜策略
- `focus` 行为测试

- [x] 为 `browser_scan` 新增 `focus` 输入，并默认回退到 `{ kind: "generic" }`
- [x] 为 `browser_scan` 新增 `includeSpecializedControls` 输入
- [x] 在 shaping 层新增 `specializedControls` 输出分组，先覆盖 `radios / switches / sliders / tabs / options / menuItems / fileInputs / dateInputs`
- [x] 在 `interactive-priority.js` 中实现 `focus.kind` 的预算倾斜，而不是硬过滤
- [x] 在 `browser-scan.md` 中补 `focus` 和 `specializedControls` 契约
- [x] 补测试，确保扩展控件不会污染主 `interactives` 分组，并验证 `form_fill`、`dialog` 等 focus 倾斜行为

## Phase 3：scan 内轻量验证

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/tools/analysis-tools.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/locator-choices.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-runtime.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/locator-ranking.js`
- Modify: `plugins/page-pilot-skill/tests/unit/locator-ranking.test.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`
- Modify: `docs/tools/browser-scan.md`

**Deliverables:**
- `verification` 输入契约
- locator-level `verification` 输出
- provenance-aware ranking 加权
- role fallback 一致性测试

- [x] 为 `browser_scan` 新增可选 `verification` 输入，并默认关闭
- [x] 在 `structured-scan.js` 中实现 scan 后的轻量 verification enrich，总量受 `maxPerElement` 和高价值元素预算限制
- [x] 让 `recommendedLocators[*]` 在验证启用时写回 `verification` 字段
- [x] 在 `locator-ranking.js` 中引入 provenance-aware score 调整，降低 placeholder-only 名称的权重
- [x] 为 role exact miss / fuzzy hit 增加单元测试，锁住 `locator / playwrightExpression / matchCount` 一致性
- [x] 更新 `browser-scan.md`，明确 scan 级验证只是轻证据，不替代 `browser_validate_playwright`
- [x] 补 integration 测试，确认 `verification.enabled` 时 top locator 带回轻量验证结果

## Phase 4：collections 第一版

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-runtime.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-shaping.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/semantic-target-ranking.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`
- Modify: `docs/tools/browser-scan.md`
- Modify: `docs/contracts.md`

**Deliverables:**
- `collections.tables`
- `collections.lists`
- `collections.resultRegions`
- 初版 `primaryCollection` hints

- [x] 在 runtime 中新增表格、列表和结果区的轻量原始采样
- [x] 在 shaping 层新增 `collections.tables / lists / resultRegions`，`cards` 先保留字段但可为空
- [x] 在 hints 中增加 `primaryCollection`，用于表达当前最像结果区的主要集合
- [x] 如 ranking 需要消费扩展控件或集合信息，扩展 `semantic-target-ranking.js` 的 flatten 逻辑
- [x] 更新 `browser-scan.md` 和 `docs/contracts.md` 示例，体现 `collections` 与 `primaryCollection`
- [x] 补测试，确保 scan 能表达“这里是表格/列表结果区、里面可能有哪些动作”这一层语义

## Phase 5：契约文档与仓库收尾

**Files:**
- Modify: `docs/tools/browser-scan.md`
- Modify: `docs/contracts.md`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/SKILL.md`
- Modify: `plugins/page-pilot-skill/tests/unit/public-contracts.test.js`
- Modify: `plugins/page-pilot-skill/scripts/doctor.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/action-stability.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/stability-wait.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/observation.js`
- Modify: `plugins/page-pilot-skill/tests/unit/observation.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`

**Deliverables:**
- 更新后的唯一真相契约文档
- `scan.v3` 示例 JSON 契约测试
- `doctor` DX 增强项
- 旧内部命名清理清单

- [x] 统一 `browser_scan` 在 `docs/tools/browser-scan.md`、`docs/contracts.md`、`SKILL.md` 中的示例与字段描述
- [x] 扩展 `public-contracts.test.js`，覆盖 `browser_scan` 关键示例字段与版本号
- [x] 根据上一轮总体 review，增强 `doctor.js`，至少补 MCP/server/CLI 相关的基础检查
- [x] 清理 `__agentBrowser*` 一类旧内部命名，统一为 `pagePilot*`
- [x] 跑一次关键字检查，确认 `browser_scan v3` 契约说明和旧命名收尾一致

## Phase 6：协议细化与结果语义拉齐

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/interactive-priority.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-runtime.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-shaping.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/analysis-tools.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/locator-choices.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`
- Modify: `docs/tools/browser-scan.md`
- Modify: `docs/contracts.md`

**Deliverables:**
- `targetText` 生效规则
- `summary` 顶层计数语义修正
- Shadow DOM 去重正确性测试
- 真实 inspection 驱动的 scan-time verification
- `possibleResultRegions` / `collections.resultRegions` 统一
- `specializedControls` 补入 `formFields`
- 顶层 `ok` 单一注入点

- [x] 让 `focus.targetText` 参与 scan 保留和优先级弱加权，不再只是回显字段
- [x] 将 `summary.discoveredInteractiveCount` 改为基于 `raw.discoveredCounts` 汇总，避免复用 runtime 截断后的 flatten 长度
- [x] 将 `retainedInteractiveCount` 改为主 `interactives` 与 `specializedControls` 合并口径
- [x] 将 `truncated` 改为只要任一 `coverage.omittedByGroup` 非零即为 `true`
- [x] 为 Shadow DOM 同 host 多匿名按钮/链接/role widget 补去重回归测试，并修复 key 生成逻辑
- [x] 让 `buildLocatorChoices()` 透传完整 inspection 结果，并让 scan 中的 `verification.visible / enabled / usable` 来源于 inspection
- [x] 让 `possibleResultRegions` 直接从 `collections.resultRegions` 派生，并同步更新 `primaryCollection` 文档说明
- [x] 将 `radios / dateInputs / fileInputs / switches` 纳入 `hints.formFields` 摘要
- [x] 移除 `normalizeRawScan()` 内的重复 `ok: true`，保留工具层统一 envelope 注入

## 验收标准

- [x] `browser_scan` 顶层 envelope 与全仓公共规则一致
- [x] `schemaVersion` 升级为 `scan.v3`
- [x] retained entry 均具备 `provenance`
- [x] role-based widget 与 Shadow DOM link/widget 能被 scan 采集到
- [x] `summary.coverage` 能说明预算截断发生在哪里
- [x] `specializedControls` 存在且不破坏主 `interactives` 分组
- [x] `verification.enabled` 时 top locator 可返回轻量验证结果
- [x] `collections.tables / lists / resultRegions` 可为 codegen 提供第一版集合区语义
- [x] `browser-scan.md` 和 `docs/contracts.md` 示例通过自动测试，不再与真实结构漂移
- [x] role exact/fuzzy fallback 一致性有单元测试锁住
- [x] `focus.targetText` 已成为真实排序/保留信号
- [x] `summary.discoveredInteractiveCount / retainedInteractiveCount / truncated` 与 `coverage` 语义一致
- [x] Shadow DOM 去重不会漏掉同 host 多匿名同组控件
- [x] scan-time verification 来自真实 locator inspection，而不是静态 `actionability`
- [x] `possibleResultRegions` 与 `collections.resultRegions` 来源统一
