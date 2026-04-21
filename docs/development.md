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
npm run install:codex
```

其中：

- `npm run setup` 负责安装 Playwright Chromium 并执行基础环境自检
- `npm run install:codex` 负责把 `page-pilot-skill` 注册到本机 Codex MCP 配置

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

当使用 `--site`、`--scenario` 或 `--tag` 做过滤运行时，CLI 会把 `Beta gate` 标记为 `not-applicable (filtered selection)`。这种运行用于验证所选场景，不用于判定全量 registry 是否满足 Beta 门槛。

## 环境检查

```bash
npm run doctor
```

如果需要强制要求浏览器已安装：

```bash
node scripts/doctor.js --require-browser
```

如果需要同时确认 Codex CLI 可用：

```bash
node scripts/doctor.js --require-codex
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
- `scripts/server.js` 存在
- `package.json`、`docs/contracts.md`、`docs/architecture.md`、`docs/development.md` 存在
- Playwright Chromium 已安装
- 本地 Codex 配置指向当前插件目录

### `npm run install:codex` 失败并提示找不到 Codex CLI

先执行：

```bash
node scripts/doctor.js --require-codex
```

如果这里失败，说明当前环境里没有可执行的 `codex` 命令，先修好 PATH 或安装 Codex，再重新执行安装脚本。

### benchmark 失败但 unit / integration 通过

这通常表示：

- 外部站点临时不可用
- 真实页面结构变化
- 代码质量门禁回退

优先查看 `artifacts/page-pilot-skill/benchmarks/` 下最新报告。
