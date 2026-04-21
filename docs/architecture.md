# Page Pilot Skill Architecture

## 一句话定位

Page Pilot Skill 是一个面向 Codex / MCP 客户端的 Playwright 代码生成辅助系统，而不是通用自治浏览器代理。

## 三层结构

### 1. Skill 层

位置：

- `plugins/page-pilot-skill/skills/page-pilot-skill/`

职责：

- 给模型提供使用顺序、工具入口和参考策略
- 说明何时先 scan、何时 rank、何时 validate、何时 generate / repair

### 2. MCP Server 层

位置：

- `plugins/page-pilot-skill/scripts/`

职责：

- 暴露公共工具契约
- 管理 session 生命周期
- 聚合 scan、ranking、probe、validation、generation、repair

### 3. Benchmark 层

位置：

- `plugins/page-pilot-skill/benchmarks/`

职责：

- 用真实练习/演示站点验证代码质量
- 衡量语义 locator 占比、CSS fallback 占比、首次验证通过率、修复后通过率等指标

## 仓库边界

### `.agents/plugins/marketplace.json`

这是本地插件市场入口，告诉本地环境有哪些插件可安装。

### `plugins/page-pilot-skill/.codex-plugin/plugin.json`

这是插件元数据，描述：

- 插件名称和版本
- Skill 目录
- 展示信息
- 对外文档链接

### `plugins/page-pilot-skill/skills/`

这是模型真正消费的 Skill 层文档，不是 MCP server 代码本身。

### `docs/`

这是仓库级文档层，负责：

- 公共工具契约
- 开发说明
- 架构边界
- 隐私 / 条款入口

## 公共能力与内部能力

公共工具清单的机器可读来源是 `plugins/page-pilot-skill/scripts/contracts/public-tool-contracts.js`；`docs/contracts.md` 和 `docs/tools/*.md` 负责提供与之对齐的人类可读契约说明。

内部 benchmark / 调试能力不属于公共契约，必须显式 gated，并且不能写进公共 Skill 说明。
