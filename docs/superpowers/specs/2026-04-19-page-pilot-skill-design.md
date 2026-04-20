# Page Pilot Skill 设计文档

## 1. 产品定位

`page-pilot-skill` 的唯一主定位是：

**帮助模型编写更可靠 Playwright / 网页自动化代码的语义辅助工具。**

它不是“缩小版 Agent Browser”，也不是“保留代理能力的过渡版本”。它存在的目标是让模型在真实网页上获得一手语义证据、生成更稳的 Playwright 代码，并对生成结果做真实校验与有限修复。

主闭环固定为：

1. `scan / analyze`
2. `locator ranking`
3. `interaction validation`
4. `code generation`
5. `generated-code verification / repair`

任何不直接服务这条闭环的能力，都不属于主线。

## 2. 成功标准

项目是否成功，不看“能否像代理一样长期自主跑任务”，而看下面这些结果是否成立：

1. 模型能从页面拿到高质量、结构化、可消费的语义对象数据。
2. 生成的 Playwright 代码默认优先语义 locator，而不是脆弱 CSS。
3. 生成代码后，系统能在真实页面上验证 locator、动作和断言是否成立。
4. 首次生成失败时，系统能在有限范围内自动修正 locator、等待或断言。
5. benchmark 能衡量代码质量，而不是 agent 式任务完成率。

## 3. 非目标

以下能力不再属于本项目范围：

- goal orchestration
- 自治探索
- 多轮任务编排
- site intelligence
- workflow intelligence
- 长期记忆
- planner / executor loop
- 通用浏览器代理式目标执行
- 默认开放的任意脚本执行

这类能力不应继续留在工具面、产品叙事、benchmark 指标或主线代码结构中。若当前代码中存在，后续应直接删除，而不是降级保留。

## 4. MCP 工具契约

### 4.1 主工具

后续稳定工具面只保留以下主工具：

- `browser_open`
  - 打开真实页面并建立一次受控会话。
- `browser_scan`
  - 输出页面级与元素级语义对象模型。
- `browser_rank_locators`
  - 基于 scan 结果对候选 locator 做排序与推荐。
- `browser_probe`
  - 受控、只读、超时受限的信息探针。
- `browser_generate_playwright`
  - 基于语义候选与验证结果生成 Playwright 代码。
- `browser_validate_playwright`
  - 在真实页面上验证 locator、动作与断言。
- `browser_repair_playwright`
  - 在验证失败后做有限修复。
- `browser_capture_screenshot`
  - 输出视觉证据。
- `browser_snapshot_dom`
  - 输出 DOM 证据。
- `browser_close`
  - 关闭会话并清理上下文。

### 4.2 删除策略

以下旧工具不做 deprecated，不做兼容说明，目标是直接从工具面删除：

- `browser_execute_js`
- `browser_run_actions`
- `browser_strategy_report`
- `browser_explore_goal`
- `browser_site_profile`

如果其中某个旧工具承担了仍然需要的能力，则必须以**新名字、新契约、新边界**重建，而不是保留旧接口。

## 5. 页面语义对象模型

`browser_scan` 的输出不再被定义为“增强 DOM 扫描”，而应被定义为**页面语义对象模型**。

### 5.1 页面级模型

页面级输出至少包含：

- `document.url`
- `document.title`
- `document.lang`
- `document.readyState`
- `regions`
  - `main`
  - `dialogs`
  - `forms`
  - `tables`
  - `lists`
  - `headings`
  - `frames`
  - `shadowRoots`
- `summary`
  - 页面级可交互概览
  - 关键反馈区域概览
  - 关键容器概览

### 5.2 元素级模型

每个候选元素都必须显式拆出以下字段，而不是混在一个泛化文本对象里：

- `role`
- `accessibleName`
- `visibleText`
- `description`
- `attributes`
  - `label`
  - `placeholder`
  - `testId`
- `state`
  - `disabled`
  - `checked`
  - `selected`
  - `expanded`
  - `pressed`
  - `required`
  - `readonly`
- `actionability`
  - `visible`
  - `enabled`
  - `editable`
  - `clickable`
  - `focusable`
- `localContext`
  - `form`
  - `dialog`
  - `table`
  - `list`
  - `heading`
  - `section`
  - `landmark`
- `geometry`
  - `x`
  - `y`
  - `width`
  - `height`
  - `viewportVisibleRatio`
- `recommendedLocators`
- `stableFingerprint`
- `confidence`

### 5.3 stableFingerprint

`stableFingerprint` 必须以稳定语义信号构成，不能退化成 CSS 路径或脆弱 DOM 路径。允许的主要来源是：

- role
- accessible name
- description
- test id
- local context
- stable neighboring heading / container signals

它用于：

- 候选去重
- 候选排序
- 验证后修复

## 6. Locator Ranking 规则

`browser_rank_locators` 的目标不是“把现有字段排个优先级”，而是输出**Playwright 语义 locator 优先**的推荐列表。

排序必须综合：

1. 语义匹配强度
2. 唯一性
3. 稳定性
4. 可读性
5. 与 Playwright 推荐风格一致性

默认优先级应体现为：

1. 高置信度 `getByRole`
2. 高置信度 `getByLabel`
3. 高置信度 `getByTestId`
4. 高置信度 `getByText`
5. 高置信度 `getByPlaceholder`
6. 最后才是 `locator(css)`

这里不是固定字段优先级，而是**基于候选质量的排序结果**。例如 `testId` 不再天然排第一，只有它在稳定性和唯一性上确实更强时才胜出。

每个推荐 locator 都应输出：

- `locatorType`
- `playwrightExpression`
- `matchCount`
- `stabilityReason`
- `fallbackReason`
- `confidence`

## 7. Probe 契约

`browser_probe` 是默认只读的信息探针，不是任意脚本执行器。

### 7.1 约束

- 默认只读
- 有固定超时
- 有明确返回值上限与可序列化约束
- 不允许状态修改型脚本作为默认路径
- 不允许用 probe 替代 scan

### 7.2 用途

probe 只补充 scan 无法直接表达的结构化信息，例如：

- 表格行列映射
- 当前控件值
- 列表选项文本映射
- 特定语义区域内部统计

## 8. Code Generation 契约

`browser_generate_playwright` 不再从“成功动作回放”直接生成代码，而要从**当前 session 中最近一次成功的 validation evidence** 生成代码。公开 MCP 契约保持 session-based，而不是把大块语义对象直接塞进 tool input。

输入：

- `sessionId`
- `testName`
- 展示开关（如是否包含 imports / test wrapper）

隐式输入证据来自该 session 最近一次 `browser_validate_playwright` / `browser_repair_playwright` 成功结果，至少包括：

- 目标语义候选
- 排序后的推荐 locator
- 已验证的动作与断言
- 已验证的状态变化证据

输出至少包含：

- `code`
- `locatorChoices`
- `fallbackLocatorChoices`
- `expectedStateChanges`
- `assertionPlan`
- `generatedPlan`
- `warnings`

## 9. Verification / Repair 契约

### 9.1 验证

`browser_validate_playwright` 至少验证：

- locator 是否命中
- 是否唯一命中
- 元素是否可交互
- 动作后是否出现预期状态变化
- assertion 是否成立

输出结果模型至少包含：

- `ok`
- `locatorResolved`
- `uniqueMatch`
- `actionExecuted`
- `stateChanged`
- `assertionsPassed`
- `failureKind`
- `evidence`

### 9.2 修复

`browser_repair_playwright` 的职责是有限修复，而不是重新做一轮大规模探索。修复产物必须能重新生成代码并重新验证。

允许的修复动作：

1. 候选 locator 重排
2. 更换次优语义 locator
3. 修正等待语义
4. 修正 assertion 表达

输出至少包含：

- `repairAttempted`
- `repairStrategy`
- `repairedCode`
- `revalidated`
- `warnings`

## 10. Benchmark 定位

benchmark 只围绕**代码生成质量**设计，不再以“跨站点 agent 任务完成率”作为核心指标。

### 10.1 核心指标

- 语义 locator 占比
- CSS fallback 占比
- 唯一命中率
- 首次验证通过率
- 修复后通过率
- 生成代码长度
- 生成代码可读性 / 冗余度
- 生成代码与页面语义一致性

### 10.2 场景设计原则

每个 benchmark 场景都应回答这些问题：

1. 页面是否被正确理解
2. 候选元素是否被正确排序
3. 生成的代码是否够短、够语义化
4. 首次验证是否通过
5. 失败后修复是否能收敛

## 11. 现有代码的处理原则

当前代码中仍有一批来自旧架构的模块。后续处理原则不是“冻结保留”，而是：

- 能复用并服务新主线的，重构后保留
- 不直接服务新主线的，删除

优先复用并重构的模块：

- `scripts/lib/structured-scan.js`
- `scripts/lib/semantic-model.js`
- `scripts/lib/locator-candidates.js`
- `scripts/lib/playwright-generator.js`
- `scripts/lib/observation.js`
- `scripts/lib/action-stability.js`

优先删除的旧模块：

- `scripts/lib/goal-orchestrator.js`
- `scripts/lib/goal-planner.js`
- `scripts/lib/strategy-report.js`
- `scripts/lib/strategy-state.js`
- `scripts/lib/site-intelligence-store.js`
- `scripts/lib/workflow-intelligence.js`

## 12. 落地完成标准

当以下条件同时成立时，可以认为这次重定位真正完成：

1. 所有入口文案都统一到 `scan/analyze -> locator ranking -> interaction validation -> code generation -> generated-code verification / repair`
2. MCP 工具面已删除旧 agent 风格工具
3. `browser_scan` 输出已经升级为明确的语义对象模型
4. locator ranking 已经以 Playwright 语义 locator 为中心
5. `browser_probe` 已替代公共任意脚本执行
6. codegen 已基于语义候选与验证结果生成
7. benchmark 已以代码质量指标为主
