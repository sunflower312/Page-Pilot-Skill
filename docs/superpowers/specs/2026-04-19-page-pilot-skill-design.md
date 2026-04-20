# Page Pilot Skill 设计文档

## 1. 产品定义

`Page Pilot Skill` 的唯一主定位是：

**帮助模型编写、验证并修复更可靠的 Playwright / 网页自动化代码。**

它不是缩小版 Agent Browser，不是长期自治执行器，也不是保留大量代理能力的过渡形态。

产品主闭环固定为：

1. `scan / analyze`
2. `locator ranking`
3. `bounded validation`
4. `code generation`
5. `verification / repair`

所有公开工具、Skill 文案、benchmark 指标、仓库入口和后续代码拆分都必须围绕这条闭环服务。

## 2. 成功标准

项目成功不再以“跨站点自主完成复杂任务”衡量，而以以下结果衡量：

1. 模型可以拿到稳定、结构化、可消费的页面语义对象模型。
2. 推荐 locator 以 Playwright 语义 locator 为主，而不是脆弱 CSS。
3. 生成代码可以基于真实页面证据，而不是基于猜测或回放残影。
4. 生成后系统可以验证 locator、动作、断言和状态变化是否成立。
5. 首次失败时系统可以在有限范围内修复 locator、等待或断言。
6. benchmark 可以直接回答“代码是否更稳、更短、更语义化、更少脆弱 locator”。

## 3. 非目标

以下能力不属于当前产品范围，不应继续出现在公开叙事、主工具面和主线实现里：

- goal orchestration
- planner / executor loop
- 自治探索
- 多轮任务编排
- site intelligence
- workflow intelligence
- 长期记忆
- 通用浏览器代理式目标执行
- 默认开放的任意脚本执行
- 完整 tab / popup / download / network 编排

如果代码中已有这类能力，应以**删除或内收**为目标，而不是继续公开或兼容保留。

## 4. 公共 MCP 工具契约

### 4.1 对外主工具

后续稳定的公共工具面只保留以下工具：

- `browser_open`
- `browser_scan`
- `browser_rank_locators`
- `browser_probe`
- `browser_validate_playwright`
- `browser_generate_playwright`
- `browser_repair_playwright`
- `browser_capture_screenshot`
- `browser_snapshot_dom`
- `browser_close`

### 4.2 删除或内收的旧入口

以下入口不再保留为公共契约：

- `browser_execute_js`
- `browser_run_actions`
- `browser_strategy_report`
- `browser_explore_goal`
- `browser_site_profile`

### 4.3 `browser_validate_playwright_code` 的处理原则

当前公开的 `browser_validate_playwright_code` 与“避免重新开放任意代码执行”这一方向冲突，因此新契约要求如下：

- 该能力**不再作为公共工具存在**
- 它必须被以下两种方式之一替代：
  - 直接删除，改为 `browser_validate_playwright` 只消费结构化步骤或 `generatedPlan`
  - 内收为 benchmark / 内部调试专用能力，并通过环境变量 gate 严格隔离
- 新主线不允许继续依赖“执行原始 Playwright 代码字符串”作为公共验证路径

**最终目标态：公共验证只接受结构化验证计划，不接受任意代码字符串。**

### 4.4 唯一真相文档要求

每个公共工具都必须在正式契约文档中写清三件事：

1. 输入 JSON 示例
2. 输出 JSON 示例
3. 什么时候不该用

Skill 文案、参考文档、MCP 工具描述都必须引用同一套契约，不允许出现多套口径。

### 4.5 顶层 success / failure envelope 语义

所有公共工具必须统一顶层 envelope 语义：

- `ok: false` 只表示工具调用失败、输入非法、session 不存在或系统异常
- 只要工具调用本身成功，顶层一律返回 `ok: true`
- 业务结果必须进入业务字段，不得复用顶层 `ok`

示例：

- `browser_validate_playwright` 使用 `validation.passed`
- `browser_repair_playwright` 使用 `repair.repaired`
- `browser_rank_locators` 使用 `matchCount`
- `browser_scan` 使用 `result` / `status` / schema 字段表达结构化结果

不允许再出现“文档示例写了 `ok: true`，实现却不返回”或“验证失败被当成工具失败”的漂移。

### 4.6 契约示例必须进入自动校验范围

`docs/contracts.md` 和 `docs/tools/*.md` 中的示例 JSON 不能只靠人工维护。

主线要求至少包括：

- fenced JSON 示例可被解析
- 关键公共工具存在示例字段快照测试
- `docs/contracts.md` 与对应 `docs/tools/*.md` 的关键结构保持一致

优先锁住的工具：

- `browser_scan`
- `browser_rank_locators`
- `browser_validate_playwright`
- `browser_generate_playwright`
- `browser_repair_playwright`

### 4.7 Locator fallback 输出一致性

任何带 fallback 的 locator 逻辑都必须满足：

- `locator`
- `playwrightExpression`
- `matchCount`

三者来自同一条最终生效 locator。

尤其是 role-based locator 在 `exact: true` miss、`exact: false` hit 时，不允许出现“对外表达式仍显示 exact，但计数来自 fuzzy fallback”的不一致。

这条约束必须通过单元测试锁死。

## 5. 页面语义对象模型

`browser_scan` 的输出必须被定义为**语义对象模型**，而不是“增强 DOM 扫描结果”。

### 5.1 页面级对象

页面级对象至少包含：

- `document.url`
- `document.title`
- `document.lang`
- `document.readyState`
- `summary`
- `regions`
  - `main`
  - `dialogs`
  - `forms`
  - `tables`
  - `lists`
  - `headings`
  - `frames`
  - `shadowRoots`

### 5.2 元素级对象

每个候选元素必须显式包含以下字段：

- `role`
- `accessibleName`
- `visibleText`
- `description`
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

### 5.3 字段边界

必须避免把以下信号混成一个模糊字段：

- accessible name
- label
- visible text
- placeholder
- description
- test id

实现和文档都必须体现这些字段的独立含义，否则后续 ranking 和 codegen 很容易再次退化。

## 6. Locator Ranking 契约

`browser_rank_locators` 的目标是给出**可直接用于 Playwright 的语义 locator 推荐列表**。

排序必须综合：

1. 语义匹配强度
2. 唯一性
3. 稳定性
4. 可读性
5. 与 Playwright 推荐风格一致性

### 6.1 默认偏好

默认偏好应体现为：

1. 高置信度 `getByRole`
2. 高置信度 `getByLabel`
3. 高置信度 `getByTestId`
4. 高置信度 `getByText`
5. 高置信度 `getByPlaceholder`
6. `locator(css)` 仅作最后兜底

这里的顺序是**语义定位优先级与候选质量的组合结果**，不是死板字段顺序。

### 6.2 每个候选必须输出

- `locatorType`
- `playwrightExpression`
- `matchCount`
- `stabilityReason`
- `fallbackReason`
- `confidence`

### 6.3 文档一致性要求

Skill 文档、参考文档、benchmark 说明和实现里的排序规则必须保持一致。
不允许再出现“文档写 text 在前，但代码实际是 testId 在前”这种漂移。

## 7. Probe 契约

`browser_probe` 是默认只读的信息探针，不是任意脚本执行器。

### 7.1 默认边界

- 默认只读
- 有超时
- 有返回值大小限制
- 返回值必须可序列化
- 不得默认修改页面状态
- 不得替代 `browser_scan`

### 7.2 推荐用途

probe 只用于补足 scan 难以直接表达的信息，例如：

- 某个表格的列索引与单元格值映射
- 某个复杂控件当前选项文本
- 某区域内的局部统计
- 语义对象模型中尚未直接编码的只读细节

## 8. Validation / Repair 契约

### 8.1 `browser_validate_playwright`

它的职责不是“重放大脚本”，而是验证一个**具体、可解释、有限的自动化假设**。

它至少应验证：

- locator 是否命中
- 是否唯一命中
- 是否可交互
- 动作后是否发生预期状态变化
- assertion 是否通过
- 如有 fallback，最终采用的是哪个候选

### 8.2 `browser_repair_playwright`

它只能做有限修复，不应变成自主探索器。

允许的修复范围：

- 候选 locator 重排
- locator 替换
- 等待调整
- assertion 调整

## 9. 工程化收尾要求

在主闭环成立后，仓库仍需完成最后一轮工程化收尾，避免继续维持“能力对，但细节仍松”的状态。

后续收尾重点包括：

- 公共 envelope 语义彻底统一
- 契约示例进入自动测试
- role fallback 一致性补测试
- `browser_scan v3` 协议升级
- 最后一批旧 `Agent Browser` 内部命名清理
- `doctor` 升级为更完整的开发环境自检入口

不允许：

- 扩展成多步自治工作流
- 自己摸索全新流程
- 越过当前假设边界去做大范围页面探索

## 9. Code Generation 契约

`browser_generate_playwright` 的目标是：

**基于 scan 语义对象、ranking 结果和 validation evidence 生成更可靠、更可读的 Playwright。**

它不应再被定义为“从成功动作回放还原代码”。

### 9.1 输入原则

公共契约保持 session-based，但隐式输入证据必须来自当前 session 内累计通过的验证证据，至少包括：

- 目标语义候选
- 排序后的推荐 locator
- 已验证的动作与断言
- 已验证的状态变化证据

### 9.2 输出要求

输出至少包含：

- `code`
- `locatorChoices`
- `fallbackLocatorChoices`
- `expectedStateChanges`
- `assertionPlan`
- `generatedPlan`
- `warnings`

### 9.3 代码质量目标

生成代码应默认追求：

- 更高比例的语义 locator
- 更少的 CSS fallback
- 更短的代码
- 更清晰的动作与断言表达
- 更强的可维护性

## 10. Benchmark 目标重写

benchmark 的主目标不再是“agent 完成长流程任务”，而是**代码质量指标**。

### 10.1 核心指标

benchmark 应明确输出并门禁以下指标：

- 语义 locator 占比
- CSS fallback 占比
- 唯一命中率
- 首次验证通过率
- 修复后通过率
- 生成代码长度
- 生成代码与页面语义一致性

### 10.2 真实流程的角色

真实站点流程仍然保留，但它们的作用应变成：

- 验证 scan / ranking / validate / generate / repair 是否有效
- 验证生成代码是否真能走过关键状态变化

而不是用来证明“这个系统已经是一个通用浏览器代理”。

## 11. 仓库边界与入口文档

仓库现在同时承载：

- 插件元数据
- Skill 文档
- MCP server
- benchmark
- 内部设计文档
- 本地插件市场元数据

因此必须补齐正式入口，明确边界。

### 11.1 顶层必备文档

下一轮实现必须补齐并维护：

- `README.md`
  - 一句话定位
  - 安装方式
  - 最短使用路径
  - 目录说明
- `LICENSE`
  - 与插件声明的 MIT 保持一致
- `docs/architecture.md`
  - 解释 Skill、MCP server、benchmark 三层关系
  - 解释 `.agents/plugins/marketplace.json`、`.codex-plugin/plugin.json`、`skills/` 三种入口各自面向谁
- `docs/contracts.md` 或 `docs/tools/*.md`
  - 放公共工具契约
- `docs/development.md`
  - Node 版本
  - Playwright 浏览器依赖
  - 测试矩阵
  - 常见故障

### 11.2 插件元数据要求

`.codex-plugin/plugin.json` 中的：

- `privacyPolicyURL`
- `termsOfServiceURL`

不能继续把仓库首页当正式地址，应改成明确的占位说明或真实文档地址。

### 11.3 叙事漂移清单

当前文档和实现之间的以下漂移必须在下一轮实现中消除：

- 公开工具数量和名称不一致
- `browser_validate_playwright_code` 是否公开不明确
- locator 顺序文档与实现不一致
- `storage state` 相关文案暗示存在“保存会话状态”的公开能力，但当前工具面并未提供对应保存工具

这些问题都属于“协议产品口径不一致”，必须在工具契约和公共文档中明确收口。

## 12. 开发体验与测试入口

### 12.1 `npm test`

新环境默认 `npm test` 不应因为未安装 Playwright 浏览器而直接失败。

可接受的目标态包括：

- `npm test` 默认只跑纯单元测试
- integration 检测到浏览器二进制缺失时自动跳过
- 或通过统一 setup/doctor 流程先完成依赖检查

### 12.2 建议命令面

下一轮实现应补齐：

- `npm run setup`
- `npm run doctor`

并把默认测试矩阵写进文档。

### 12.3 Lint 边界

lint 不能只检查一个入口文件。最少应覆盖：

- `scripts/mcp-server.js`
- `scripts/lib/*.js`
- `benchmarks/lib/*.js`
- Skill 文档所在目录的关键配置文件

## 13. 代码结构收口

下一轮代码结构调整应体现以下原则：

### 13.1 `mcp-server.js`

应拆为：

- `schemas/`
- `tools/`
- `server.js`

避免一个文件同时承担 schema、helper、注册和部分业务拼装。

### 13.2 `structured-scan.js`

浏览器侧 runtime 应抽离为独立模板或资源文件，不再长期内嵌在超大模块里。

### 13.3 locator 表达式逻辑

locator 到 Playwright 表达式的转换逻辑必须收成唯一来源，避免在多个模块里各写一份近似实现。

### 13.4 命名清晰度

职责容易混淆的模块应重命名，例如当前容易混淆的：

- `locator-ranking.js`
- `semantic-target-ranking.js`

后续应通过命名让人一眼区分“排序逻辑”与“工具入口包装”。

## 14. 旧命名与旧状态清理

下一轮实现还必须清掉旧 Agent Browser 残留，包括：

- fixture 中的旧品牌命名
- integration 中硬编码的旧 artifact 路径
- `browser-manager.js` 等内部状态里无意义保留的旧代理字段

原则是：

**既然项目已经重新定位为 Page Pilot Skill，就不再保留会持续制造认知噪音的旧品牌和旧状态。**

## 15. 下一轮实现的总原则

下一轮改造必须把这个项目当成**协议产品**来做，而不是继续把它当成“浏览器自动化能力集合”来堆功能。

先锁死三件事：

1. 公开工具到底有哪些
2. 每个工具的输入输出到底长什么样
3. 哪些能力是内部 benchmark 专用，哪些能力真的对 Codex 公开

只有这三件事稳定下来，后续代码拆分、文档补齐、CI 和 benchmark 才会越做越稳。
