# Page Pilot Skill 真实 Benchmark 框架设计文档

> 2026-04-19 定位更新：本文所述真实 benchmark 框架现服务于“帮助模型编写更可靠 Playwright / 网页自动化代码的语义辅助工具”这一主定位。benchmark 的核心价值是衡量页面理解、locator 质量、代码生成质量与生成后验证质量，而不是证明通用浏览器代理的长期自主执行能力。

## 1. 目标

为 `plugins/page-pilot-skill` 建立一套基于真实公开练习 / 演示 / sandbox 站点的 benchmark 验收框架，用来验证四类能力：

- 网页信息抽取能力
- 浏览器自动化能力
- 复杂交互鲁棒性
- 端到端任务完成能力

本阶段的 benchmark 定位是“本地执行的真实验收套件”，不是日常默认测试入口。

## 2. 关键原则

### 2.1 真实站点优先

- 只使用站点官方明确声明为练习、演示、sandbox、playground、demo 的公开站点。
- benchmark 结果不再依赖本地构造业务流程页证明系统能力。

### 2.2 机制测试与能力验收分离

- 继续保留底层机制测试使用的最小 fixture，例如结构化扫描、稳定性判定、代码生成等内部 contract 测试。
- 删除或降级本地构造业务流程页的验收地位，尤其是 `goal-*` 这类模拟登录 / 学习流程页面。

### 2.3 框架化，而不是散装脚本

- 每个站点都要有清晰的合规模型、场景定义、步骤、预期结果、失败模式和可执行代码。
- 新增站点时应只需要增加 manifest 与 scenario 文件，不应改动 runner 主干逻辑。

### 2.4 产物必须可审计

每次 benchmark 执行至少产出：

- 结构化 JSON 结果
- Markdown 报告
- 关键步骤日志
- 失败截图与错误摘要

## 3. 非目标

本阶段明确不做：

- 将真实 benchmark 纳入 `node --test` 默认入口
- 用 benchmark 取代全部单元 / 集成机制测试
- 覆盖上传、下载、浏览器接管、GUI 物理交互
- 对所有候选站点一口气做极深场景覆盖
- 把 benchmark 直接做成 CI 外网依赖

## 4. 总体架构

### 4.1 目录结构

在 `plugins/page-pilot-skill` 下新增：

- `benchmarks/registry/`
  - 站点 manifest 注册表
- `benchmarks/scenarios/`
  - 各站点可执行场景
- `benchmarks/tasks/`
  - 可复用任务函数，负责抽取、登录、分页、动态等待、表格解析、多步骤流程等
- `benchmarks/lib/`
  - MCP 客户端、runner、报告生成、断言、日志与 artifact 工具
- `benchmarks/reports/`
  - 报告模板与 README
- `scripts/run-benchmarks.js`
  - 本地 benchmark CLI 入口

### 4.2 运行模型

benchmark runner 作为 `page-pilot-skill` 的黑盒验收层，通过本地启动 `scripts/mcp-server.js` 并调用 MCP tools 执行真实站点场景。

这样可以确保 benchmark 验证的是插件公开能力，而不是只验证某个内部函数。

### 4.3 执行入口

新增脚本入口：

- `npm run benchmark -- --site <site-id>`
- `npm run benchmark -- --site <site-id> --scenario <scenario-id>`
- `npm run benchmark -- --all`

默认输出目录为：

- `artifacts/page-pilot-skill/benchmarks/<timestamp>/`

## 5. 数据模型

### 5.1 Site Manifest

每个站点 manifest 至少包含：

- `id`
- `label`
- `baseUrl`
- `compliance`
  - `status`: `qualified` / `pending`
  - `officialEvidenceUrl`
  - `officialEvidenceSummary`
- `capabilities`
  - 本站点覆盖的 benchmark 能力标签
- `defaultScenarios`
- `notes`

### 5.2 Scenario Definition

每个场景定义都按统一结构组织：

- `site`
- `scenario`
- `goal`
- `capabilities`
- `steps`
- `expectedResults`
- `failureModes`
- `run(context)`

其中 `run(context)` 返回结构化结果：

- `ok`
- `assertions`
- `artifacts`
- `measurements`
- `notes`

### 5.3 Report Model

每次执行输出：

- `summary.json`
  - 总执行状态、通过率、失败场景、耗时、输出路径
- `site-<id>.json`
  - 站点级结构化结果
- `site-<id>.md`
  - 人类可读报告，按“站点 -> 场景 -> 步骤 -> 预期结果 -> 失败模式 -> 可执行测试代码”组织

## 6. 场景能力映射

第一批 benchmark 站点与核心场景：

### 6.1 ToScrape

- Quotes 分页抽取
- Books 商品结构化抽取

覆盖：

- 静态抽取
- 分页
- 文本 / 列表结构化提取

### 6.2 Scrape This Site

- Countries 表格抽取
- AJAX 延迟内容抓取

覆盖：

- 表格抽取
- 搜索 / AJAX
- 更接近真实数据页的 DOM 抽取

### 6.3 Web Scraper Test Sites

- 分页商品列表抽取
- Load More / AJAX 商品增长检测

覆盖：

- 标准分页
- AJAX 分页
- Load More

### 6.4 TryScrapeMe

- 跨源 iframe 发现与引用文档提取
- 图片资源与样式偏移下的稳定定位

覆盖：

- cross-origin iframe discovery
- 样式干扰下的鲁棒提取

### 6.5 The Internet

- 登录流程
- 动态加载或动态内容
- Shadow DOM 或 frame 类场景

覆盖：

- 登录
- 动态内容
- 复杂交互

### 6.6 UI Testing Playground

- 动态 ID / 不稳定定位
- AJAX 延迟按钮

覆盖：

- locator 稳定性
- 显式等待
- 遮挡 / 延迟场景

### 6.7 Expand Testing

- 基础登录或表单流程

覆盖：

- 登录 / 表单
- 基础多步骤自动化

### 6.8 QA Playground

- iframe / shadow DOM / alerts 或多步骤表单中的一个代表场景

覆盖：

- 复杂控件
- 多步骤业务流

### 6.9 ParaBank

- 注册与登录
- 账单支付或转账流程中的一个代表场景

覆盖：

- 有状态多页面任务

### 6.10 DemoQA

- 表单或表格场景

覆盖：

- 通用 UI 自动化

### 6.11 RPA Challenge

先纳入 registry 与报告体系，但默认标记为 `pending`，仅在确认其页面行为与自动化边界适配后启用正式执行。

原因：

- 它更偏“动态字段映射挑战”，适合作为第二批复杂任务 benchmark，而不是首批框架落地阻塞项。

## 7. 可复用任务函数

为了满足“默认产出可复用 task function / page object”的要求，本阶段优先实现通用任务函数，而不是为每个站点硬写一套 page object。

任务函数分层如下：

- `openAndScan`
- `runActionSequence`
- `extractPaginatedCollection`
- `extractTableRows`
- `waitForAjaxContent`
- `performLoginFlow`
- `completeStatefulTask`
- `captureFailureArtifacts`

如果某个站点确实需要站点特化封装，再在场景目录内部加薄 page object 包装。

## 8. 测试与清理策略

### 8.1 保留的测试

- `tests/unit/` 中的算法、状态建模、优先级、代码生成、扫描 contract 测试
- `tests/integration/browser-workflow.test.js` 中的机制性 fixture 场景

### 8.2 移除或降级的测试

- `tests/integration/goal-exploration.test.js`
- `tests/integration/mcp-server.test.js` 中依赖 `goal-login.html` 的构造流程段
- 不再把 `tests/fixtures/goal-*.html` 作为系统能力证明

### 8.3 新验证方式

- 真实 benchmark 由 `scripts/run-benchmarks.js` 驱动
- 完成实现后立即执行一次 benchmark
- benchmark 结果成为能力验收材料

## 9. 错误处理与鲁棒性

runner 需要对真实网站波动做有限控制，但不能把失败“吞掉”：

- 支持站点级超时
- 支持场景级有限重试
- 网络 / 页面异常要明确写入报告
- 页面结构漂移要输出失败步骤和定位信息
- 如果站点被判定不再合规或不可用，报告中必须显式标记

## 10. 实施顺序

第一阶段：

- 建 benchmark 框架
- 建 runner / report / manifest 模型
- 移除构造流程 benchmark 地位

第二阶段：

- 接入首批真实站点场景
- 跑通至少一轮真实 benchmark

第三阶段：

- 根据结果继续扩站点和场景深度

## 11. 验收标准

本阶段完成的标志是：

- 仓库中有正式的真实 benchmark 框架与 CLI 入口
- `goal-*` 构造流程页不再承担能力验收角色
- 首批真实站点 manifest 与场景接入完成
- benchmark 能输出结构化 JSON 与 Markdown 报告
- 至少完成一次真实 benchmark 执行并产出结果
