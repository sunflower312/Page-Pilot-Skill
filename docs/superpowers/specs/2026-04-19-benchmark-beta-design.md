# Page Pilot Skill Benchmark Beta 深化设计

> 2026-04-19 定位更新：本文中的 Beta benchmark 现在用于衡量 scan / analyze 质量、locator 语义质量、生成代码稳定性与修复能力，不再把“长期自主完成复杂网站任务”作为主门禁。

## 目标

把 `plugins/page-pilot-skill/benchmarks` 从“完整真实验收套件”进一步推进到 “Beta 级验收基座”。

本轮不改动运行时能力本身，专注把 benchmark 做成后续能力演进的可靠尺子，满足：

- 覆盖深度足够：弱覆盖站点不再只有 1 到 3 个代表场景。
- 能力矩阵可验证：不是人工描述“覆盖到了”，而是 runner 和自检能计算核心能力覆盖。
- 默认门禁更强：`npm run benchmark` 通过意味着“站点深度 + 场景数量 + 能力交叉覆盖”同时达标。

## Beta 级 Benchmark 定义

### 1. 站点深度

- 保持 11 个相关公开练习 / demo / sandbox 站点全部纳入 registry。
- 除 `rpa-challenge` 这类天然单核心场景站点外，其余站点至少应有 3 个以上 `qualified` 场景。
- 当前偏薄站点需要补足：
  - `the-internet`
  - `ui-testing-playground`
  - `expand-testing`
  - `qa-playground`
  - `demoqa`
  - `parabank`

### 2. 场景总量

- 默认 `qualified` 场景总量提升到至少 45 个。
- `pending` 场景允许存在，但必须有明确的 live defect 或站点侧阻塞说明，且不影响默认门禁。

### 3. 能力矩阵

benchmark 不再只按站点枚举，还要显式覆盖下面这些核心能力类目：

- `content_extraction`
- `pagination_and_growth`
- `async_waiting`
- `forms_and_auth`
- `dialogs_and_visibility`
- `iframe_and_shadow`
- `stateful_workflows`
- `locator_resilience`

每个类目都必须由多个真实站点交叉覆盖，而不是单站点独占。

### 4. 报告可读性

JSON / Markdown 报告应新增 Beta coverage 视图，至少包括：

- 每个能力类目的场景数与站点数
- 每个站点的 `qualified / pending` 场景数量
- 当前 registry 是否满足 Beta 阈值

## 本轮新增场景方向

### The Internet

- Checkbox 状态切换
- Dynamic Controls 异步状态变化
- Entry Ad 模态关闭

### UI Testing Playground

- Progress Bar 精确等待
- Dynamic Table 提取与比对
- Shadow DOM GUID 组件

### Expand Testing

- Dynamic Pagination Table
- Shadow DOM 提取

### QA Playground

- Alerts / Dialogs 中的 toast 或 modal
- Radio / Checkbox 状态切换

### DemoQA

- Radio Button 选择与结果回写

### ParaBank

- Transfer Funds 或其他稳定可跑的多页状态流

## 架构改动

### 1. 新增 coverage-matrix 计算层

新增 benchmark coverage 模块，职责：

- 从 registry 计算能力类目覆盖
- 计算站点深度
- 计算是否满足 Beta 门禁

这个模块不参与场景执行，只负责对 registry 和 run 结果做结构化总结。

### 2. Runner / Report 集成

`benchmark-runner` 与 `report-writer` 需要把 coverage 结果带入最终 run artifact。

### 3. Registry 元数据增强

为 scenario 增加稳定的 `metadata.capabilities`，不要继续只靠松散 tag 猜能力归属。tag 继续服务筛选；capabilities 负责 Beta coverage。

## 验收标准

完成后应满足：

- 默认 `qualified` 场景数不少于 45
- 11 个相关站点全部保留在 registry
- 新增 coverage matrix 自检通过
- `npm run benchmark:test` 通过
- `npm run benchmark` 通过
- `node --test` 通过
- 最后一轮 `gpt-5.4 high` code review 没有重大 correctness finding

## 非目标

- 不把纯 API benchmark 纳入默认门禁
- 不因为追求数量加入与项目目标弱相关的页面
- 不把 live defect 站点强行改成 `qualified`
- 不在本轮扩展 GUI / 上传下载 / 浏览器接管类能力
