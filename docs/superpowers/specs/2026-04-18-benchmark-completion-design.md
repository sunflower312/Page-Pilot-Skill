# Page Pilot Skill Benchmark 补全设计

> 2026-04-19 定位更新：本文中的 benchmark 补全工作现在从属于“语义辅助式 Playwright 代码生成工具”主线。站点与场景覆盖应优先服务代码生成质量、locator 稳定性和生成后验证，而不是通用 agent 任务完成率。

## 目标

把 `plugins/page-pilot-skill` 的真实 benchmark 从“首批 smoke 场景”扩展成“覆盖全部相关公开练习 / demo / sandbox 站点的本地验收套件”。

本轮目标不是继续增加 fake fixture，而是让 benchmark 具备下面三种能力：

- 全站点覆盖：把已确认与项目目标相关的公开练习站点全部纳入 registry。
- 多能力覆盖：每个站点至少覆盖 2 个以上与本项目相关的真实能力点。
- 默认可执行：所有已确认稳定的场景都纳入默认 `npm run benchmark` 验收。

## 范围

### 纳入站点

- ToScrape
- Scrape This Site
- Web Scraper Test Sites
- TryScrapeMe
- The Internet
- UI Testing Playground
- Expand Testing
- QA Playground
- RPA Challenge
- DemoQA
- ParaBank

### 不纳入默认 benchmark 的能力

- 上传 / 下载文件本身
- GUI 物理交互
- 接管本机真实浏览器
- 与目标无关的纯 API benchmark

这些能力与当前 `page-pilot-skill` 目标不一致，因此即使站点里存在对应页面，也不进入默认验收。

## 设计原则

### 1. 默认 benchmark 代表“完整本地验收”

`npm run benchmark` 不再只跑少数 smoke 场景，而是跑所有 `qualified` 场景。

### 2. 每个站点至少覆盖两个真实能力点

不是“站点进 registry 就算完成”，而是要覆盖站点里与目标相关的核心能力面，例如：

- 抽取
- 分页
- AJAX / 延迟加载
- 登录
- 表单
- 动态定位
- iframe / shadow DOM
- 多步骤状态流

### 3. 不为了凑数纳入不稳定页面

如果某页当前真实不可用、站点路径已失效，或页面噪声会导致默认 benchmark 高概率波动，就从默认集合排除，但要在设计和 registry 中写清原因。

### 4. 场景优先复用共享模式

新增场景优先复用现有 `scenario-tools`，必要时补共享 helper，而不是为每个页面各写一套 runner 逻辑。

## 站点覆盖矩阵

### ToScrape

- Books 分页与商品抽取
- Quotes 登录
- Quotes JavaScript 渲染列表
- Quotes 无限滚动 / 延迟渲染

### Scrape This Site

- Countries 简单表格抽取
- Hockey 搜索与分页
- AJAX 电影按年份过滤
- Frames / iFrames 内容抽取

### Web Scraper Test Sites

- 静态目录页抽取
- AJAX 分页
- Load More
- 滚动加载

### TryScrapeMe

- 跨源 iframe 发现与引用文档提取
- 分页
- 模拟登录
- 表单 / 预填值提取

### The Internet

- 登录
- Dynamic Loading
- Shadow DOM

### UI Testing Playground

- AJAX 延迟标签
- Dynamic ID
- Overlapped / Visibility 等等待与定位问题

### Expand Testing

- 登录成功
- 注册成功
- Inputs 展示 / 清空

### QA Playground

- 多字段表单提交
- Dynamic Waits
- Data Table

### RPA Challenge

- 动态字段映射挑战

本轮不要求处理下载 Excel 文件本身，但要求覆盖“字段位置变化、按标签稳定填写”的核心能力。

### DemoQA

- Text Box 提交
- Web Tables 过滤与结果断言

### ParaBank

- 注册并进入账户总览
- Open New Account 站内状态流
- Bill Pay 作为已纳入 registry 的待重试场景保留，当前不进入默认验收，因为 2026-04-18 live probe 中页面未暴露 source account options，提交后返回服务端内部错误

## 架构改动

### Registry 扩展

为 site / scenario manifest 增加更清晰的能力标签与默认执行语义：

- 站点能力标签
- 场景能力标签
- 默认运行说明
- 更明确的合规证据

### 场景组织

每个站点单独目录，场景保持一个文件一个能力点，避免大而杂的“全站脚本”。

### 共享 helper

本轮保持 benchmark runner 不扩张，只复用现有 `scenario-tools`。复杂场景通过场景文件内部的局部 helper 处理，避免为了当前站点细节把共享层做重。

## 验收标准

完成后应满足：

- 上述全部相关站点都存在于 registry 中
- 默认 benchmark 不再只有 7 个场景，而是覆盖全部已实现 `qualified` 场景
- `npm run benchmark:list` 能清楚列出每个站点和场景
- `npm run benchmark:test` 通过
- `npm run benchmark` 在当前网络环境下能完成默认验收，并产出 JSON / Markdown 报告
- 最后一轮 `gpt-5.4 high` review 没有重大 correctness finding

## 风险与处理

### 外站波动

真实站点可能临时故障。处理方式不是退回 fake fixture，而是：

- 优先选择稳定页面
- 对确实不可用的页面明确记录
- 同站点优先保留其他稳定能力场景

### 场景数量变多导致默认验收变慢

这是接受的成本，因为本套件定位就是本地完整验收，而不是日常快速单测。

### 动态站点的 brittle 选择器

优先使用：

- role / label
- test id
- 语义文本
- 站点固有结构

避免把动态 CSS id 当成主定位手段。
