# Page Pilot Skill

Page Pilot Skill 是一个帮助模型编写更可靠 Playwright / 网页自动化代码的语义辅助工具。

它的主闭环是：

1. `browser_open`
2. `browser_scan`
3. `browser_rank_locators`
4. `browser_probe`
5. `browser_validate_playwright`
6. `browser_generate_playwright`
7. `browser_repair_playwright`

项目重点不是长期自治浏览器代理，而是帮助模型基于真实页面证据做出更稳的页面理解、locator 选择、代码生成和生成后复验。

## 安装

在 `plugins/page-pilot-skill` 目录运行：

```bash
npm install
npm run setup
```

如果只需要检查环境：

```bash
npm run doctor
```

## 最短使用路径

```bash
cd plugins/page-pilot-skill
npm run test
npm run test:integration
npm run benchmark:test
```

常见完整回归：

```bash
cd plugins/page-pilot-skill
npm run test:all
npm run benchmark
```

仓库还带有 GitHub Actions 持续集成，默认跑 `lint + unit + integration + benchmark:test`，用于保证公共契约和本地可复现质量门禁不回退。

如果你想在本地复现和 CI 完全一致的检查，直接运行：

```bash
cd plugins/page-pilot-skill
npm run test:ci
```

## 目录结构

- `plugins/page-pilot-skill/`
  Page Pilot Skill 的插件主体、MCP server、benchmark、测试和 Skill 文档
- `docs/contracts.md`
  公共 MCP 工具契约入口
- `docs/tools/`
  各工具的详细契约文档
- `docs/architecture.md`
  仓库结构与系统边界
- `docs/development.md`
  本地开发、测试矩阵和常见故障
- `.agents/plugins/marketplace.json`
  本地插件市场入口

## 文档入口

- 公共工具契约：[docs/contracts.md](docs/contracts.md)
- 架构说明：[docs/architecture.md](docs/architecture.md)
- 开发说明：[docs/development.md](docs/development.md)
- 隐私政策：[docs/privacy-policy.md](docs/privacy-policy.md)
- 服务条款：[docs/terms-of-service.md](docs/terms-of-service.md)

## 许可证

本仓库采用 MIT 许可证，见 [LICENSE](LICENSE)。
