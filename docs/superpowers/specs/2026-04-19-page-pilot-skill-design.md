# Page Pilot Skill 设计文档

## 1. 重定位结论

`page-pilot-skill` 的主定位从“通用 headless 浏览器代理”收口为：

**帮助模型编写更可靠 Playwright / 网页自动化代码的语义辅助工具。**

它仍然保留真实页面访问、必要动作验证和结果观测能力，但这些能力的目标不再是长期自主完成复杂网站任务，而是为模型提供一手页面证据，提升代码生成时的页面理解、定位器选择、动作表达和生成后校验质量。

## 2. 产品定义

本项目应服务这样一条闭环：

1. 打开真实网页并采集高质量语义扫描结果
2. 识别候选元素，给出稳定定位建议与上下文
3. 基于候选元素生成更语义化、更稳的 Playwright 代码
4. 对生成结果做真实页面验证
5. 若验证失败，自动重排候选或修正 locator / assertion
6. 将结果以简洁、结构化的形式反馈给模型，帮助其继续决策和改写代码

这意味着项目的成功标准不是“像一个代理一样自己跑完整网站”，而是“让模型写出的网页自动化代码更稳定、更短、更可读、更少脆弱 locator，并且生成后可以自证”。

## 3. 核心目标

### 3.1 高质量 scan / analyze

以 accessibility / ARIA 语义为主，结合 DOM、layout、visible text，对页面进行结构化分析，输出高价值候选元素信息。

### 3.2 语义优先的 locator 排序

优先产出符合 Playwright 风格的定位方式：

- `getByRole`
- `getByLabel`
- `getByText`
- `getByTestId`

仅在必要时才回退到 `locator(css)`。

### 3.3 真实动作验证

保留最小但关键的真实交互能力，用于验证生成代码是否真的能：

- 输入
- 点击
- 勾选
- 下一步
- 登录
- 提交表单
- 触发预期状态变化

### 3.4 生成后验证 / 修复

生成代码不是终点。系统必须能验证：

- locator 是否真的命中目标元素
- 动作后是否出现预期状态变化
- assertion 是否与真实页面状态一致

失败时应自动尝试：

- 重排候选 locator
- 改用次优语义 locator
- 修正 assertion 或等待语义

### 3.5 Benchmark 服务代码质量

benchmark 的主目标是衡量：

- 生成代码是否更稳
- 代码是否更短、更语义化
- locator 是否更少依赖脆弱 CSS
- 生成后验证是否能有效发现和修复问题

而不是衡量一个通用 agent 是否能自主完成长流程任务。

## 4. 非目标

以下能力不再作为主线优先级：

- 长期自主执行复杂网站任务
- 站点长期记忆、site intelligence、workflow intelligence
- 复杂多轮 planner / executor loop
- 完整 tab / popup / download / network 编排
- 通用浏览器代理式目标探索
- 默认开放的任意脚本执行能力

如果这些能力未来要保留，也只能作为辅助实现细节存在，前提是它们能够直接提升代码生成质量。

## 5. 核心工具面

### 5.1 保留并强化

- `browser_open`
- `browser_scan`
- `browser_run_actions`
- `browser_generate_playwright`
- `browser_capture_screenshot`
- `browser_close`

### 5.2 新主线能力

- `scan / analyze` 输出候选元素语义模型
- locator ranking
- readonly probe
- generated code validation / repair

### 5.3 降级为非核心

- `browser_execute_js`
- `browser_strategy_report`
- `browser_explore_goal`

这些能力即使暂时不删除，也不应继续作为产品主轴。

## 6. Scan / Analyze 输出模型

### 6.1 页面级信息

- URL
- title
- lang
- main landmarks
- visible dialogs
- frames / shadow roots 摘要
- 重要 heading / table / form / list 区域

### 6.2 候选元素信息

每个高价值候选元素至少应输出：

- `role`
- `accessibleName`
- `description`
- `visibleText`
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
- `interactable`
- `geometry`
  - `x`
  - `y`
  - `width`
  - `height`
- `context`
  - 所属表单
  - 所属弹窗
  - 所属表格
  - 所属 section / heading
  - 是否位于主内容区
- `recommendedLocators`
- `stableFingerprint`

### 6.3 stableFingerprint

`stableFingerprint` 不应依赖易漂移 CSS 路径，而应尽量由以下高信号组合构成：

- role
- accessible name
- stable label / description
- test id
- 所属语义容器
- 相邻 heading / form / dialog 上下文

它的目标不是直接暴露给用户，而是用于：

- 候选去重
- locator 重排
- 生成后修复

## 7. Locator 排序原则

默认排序不应只是字段存在性判断，而应综合以下因素：

1. 语义强度
2. 唯一性
3. 稳定性
4. 可读性
5. 与 Playwright 官方推荐风格的一致性

推荐顺序应为：

1. 唯一且稳定的 `getByRole`
2. 可靠的 `getByLabel`
3. 明确、稳定的 `getByTestId`
4. 可接受的 `getByText`
5. 必要时的 `getByPlaceholder`
6. 最后才是 `locator(css)`

如果 `testId` 明显比 role 更稳定且更短，可在排序器里胜出，但不应再把 `testId` 固定写死为全局第一优先级。

## 8. 只读探针

项目需要一个受控的只读 JS 探针能力，用来补充 scan / analyze 无法直接表达的信息。

约束如下：

- 默认只允许读取信息，不允许执行会改变页面状态的任意脚本
- 用途是补充结构化信息，不是替代 scan / analyze
- 优先通过内置探针模板完成，例如：
  - 读取表格当前行列关系
  - 读取选项文本映射
  - 读取表单控件当前值
  - 读取某个语义区域的内部结构

## 9. 生成后验证 / 修复链路

### 9.1 验证目标

验证器至少要检查：

- 生成的 locator 是否能命中且命中数量符合预期
- 元素是否可见、可交互
- 动作是否触发预期状态变化
- assertion 是否与真实页面状态一致

### 9.2 修复策略

当首次生成失败时，系统应优先尝试：

1. 同组候选 locator 重排
2. 降级到次优语义 locator
3. 修正等待逻辑
4. 修正 assertion 表达

而不是直接把失败抛回给模型。

## 10. Benchmark 重心

benchmark 应从“真实 agent 任务完成能力”转向“代码生成辅助质量”。

### 10.1 核心指标

- 语义 locator 占比
- CSS fallback 占比
- 生成代码长度与简洁度
- 生成后首次验证通过率
- 自动修复后通过率
- 生成代码与页面真实语义的一致性

### 10.2 场景选择原则

保留真实站点 benchmark，但每个场景都应围绕下面这些问题设计：

- 页面能否被正确理解
- 候选元素是否被正确排序
- 生成代码是否足够语义化
- 生成后验证是否能发现错误
- 修复链路是否能让代码收敛到稳定版本

## 11. 兼容与迁移策略

当前代码里已有较强基础，未来实现应优先复用而非推倒重来：

- 复用并升级 `structured-scan`
- 复用并改造 `semantic-model`
- 重构 `locator-candidates`
- 重构 `playwright-generator`
- 保留 `browser_run_actions` 作为最小真实验证层

与新定位冲突的模块应从主线上降级：

- `goal-orchestrator`
- `strategy-report`
- `site-intelligence-store`
- `workflow-intelligence`

## 12. 成功标准

当项目达到以下状态时，说明本次重定位已经落地：

1. 模型能够通过 `scan / analyze` 得到高质量候选元素语义数据
2. 生成的 Playwright 代码默认更偏语义 locator，而不是脆弱 CSS
3. 生成后的代码可以自动验证和有限修复
4. benchmark 能明确衡量代码生成质量，而不是代理式任务完成率
5. 非核心代理能力不再继续主导架构演进
