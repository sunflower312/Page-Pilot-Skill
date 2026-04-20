# Development

## 环境要求

- Node.js `>= 20`
- npm
- Playwright Chromium 浏览器二进制

当前本地开发建议直接使用：

```bash
cd plugins/page-pilot-skill
npm install
npm run setup
```

## 常用命令

### 默认测试

```bash
npm test
```

默认只跑单元测试，避免新环境因为尚未安装 Chromium 而直接失败。

### 集成测试

```bash
npm run test:integration
```

要求本机已经安装 Playwright Chromium。

### 全量本地回归

```bash
npm run test:all
```

会依次执行：

- `lint`
- `test`
- `test:integration`
- `benchmark:test`
- `benchmark`

### CI 同步回归

```bash
npm run test:ci
```

这条命令和 GitHub Actions 的默认门禁保持一致，只跑本地可复现的质量门禁，不包含真实外站 benchmark。

## 持续集成

仓库包含一条 GitHub Actions 流水线：

- `.github/workflows/ci.yml`

它会在 `ubuntu-latest` 上执行：

- `npm ci`
- `npx playwright install --with-deps chromium`
- `npm run test:ci`

这条流水线刻意不跑真实外站 `benchmark`，只跑自检和本地可复现门禁。

### Benchmark 自测

```bash
npm run benchmark:test
```

### 真实 benchmark

```bash
npm run benchmark
```

## 环境检查

```bash
npm run doctor
```

如果需要强制要求浏览器已安装：

```bash
node scripts/doctor.js --require-browser
```

## 常见故障

### `npm test` 通过，但 `npm run test:integration` 失败

通常表示 Chromium 尚未安装。执行：

```bash
npm run install:chromium
```

### MCP server 启动失败

先检查：

```bash
npm run doctor
```

然后确认：

- `scripts/mcp-server.js` 存在
- Playwright Chromium 已安装
- 本地 Codex 配置指向当前插件目录

### benchmark 失败但 unit / integration 通过

这通常表示：

- 外部站点临时不可用
- 真实页面结构变化
- 代码质量门禁回退

优先查看 `artifacts/page-pilot-skill/benchmarks/` 下最新报告。
