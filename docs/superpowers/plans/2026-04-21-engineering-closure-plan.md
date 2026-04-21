# Page Pilot Skill 工程收口执行计划

> **Goal:** 完成公共契约单一来源、`browser_scan` 内部解耦、工具层继续分层、benchmark 运维化，以及 DX / 历史命名清理，并在完成后跑完整 benchmark 与多轮 code review。

## 总体要求

- 不改变现有公开工具集合。
- 不改变 `browser_scan v3` 的公共协议含义。
- 所有收口必须补对应测试或验证。
- 完成后必须运行 `npm run test:ci` 与完整 `npm run benchmark`。
- 完成后必须进入子代理 review 循环，直到没有重大问题。

## Phase A：公共契约单一来源

**Files:**
- Create: `plugins/page-pilot-skill/scripts/contracts/public-tool-contracts.js`
- Modify: `plugins/page-pilot-skill/tests/unit/public-contracts.test.js`
- Modify: `docs/contracts.md`
- Modify: `plugins/page-pilot-skill/skills/page-pilot-skill/SKILL.md`

**Deliverables:**
- 公共工具注册表
- 基于注册表的契约测试
- 文档 / 测试 / 工具面一致性基线

- [ ] 建立公共工具注册表，收录工具 id、契约标题、详细文档文件名与工具类别
- [ ] 让 `public-contracts.test.js` 使用共享注册表，而不是再硬编码一套工具清单
- [ ] 检查 `docs/contracts.md`、`docs/tools/*.md`、`SKILL.md` 是否与注册表一致
- [ ] 为注册表补最小校验，确保工具 id、文档文件名与契约标题不重复

## Phase B：`browser_scan` 内部 collector 解耦

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-runtime.js`
- Modify: `plugins/page-pilot-skill/scripts/lib/structured-scan-shaping.js`
- Create: `plugins/page-pilot-skill/scripts/lib/structured-scan-runtime-helpers.js`
- Create: `plugins/page-pilot-skill/scripts/lib/structured-scan-coverage.js`
- Create: `plugins/page-pilot-skill/scripts/lib/structured-scan-collections.js`
- Create: `plugins/page-pilot-skill/scripts/lib/structured-scan-focus.js`
- Modify: `plugins/page-pilot-skill/tests/unit/structured-scan.test.js`
- Modify: `plugins/page-pilot-skill/tests/integration/browser-workflow.test.js`

**Deliverables:**
- scan runtime helper 拆分
- coverage helper
- collections helper
- focus helper

- [ ] 从 runtime 中抽离去重 key、同组归类、specialized control 判定等纯 helper
- [ ] 从 shaping 中抽离 `coverage` 汇总逻辑
- [ ] 从 shaping 中抽离 `collections` / `possibleResultRegions` / `primaryCollection` 相关逻辑
- [ ] 从 shaping 中抽离 `focus.kind` 与 `focus.targetText` 的匹配和加权逻辑
- [ ] 保持 `browser_scan` 公共输出不变，并补回归测试

## Phase C：工具层继续分层

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/tools/analysis-tools.js`
- Modify: `plugins/page-pilot-skill/scripts/tools/playwright-tools.js`
- Create: `plugins/page-pilot-skill/scripts/tools/analysis/`
- Create: `plugins/page-pilot-skill/scripts/tools/playwright/`
- Create: `plugins/page-pilot-skill/scripts/tools/response-shaping.js`
- Modify: `plugins/page-pilot-skill/scripts/server.js`
- Modify: `plugins/page-pilot-skill/tests/integration/mcp-server.test.js`

**Deliverables:**
- analysis tool register helpers
- playwright tool register helpers
- 共享 response shaping helper

- [ ] 将 `analysis-tools.js` 拆到按工具或按子域组织的 register helper
- [ ] 将 `playwright-tools.js` 拆到按工具组织的 register helper
- [ ] 抽出公共 response shaping helper，减少工具文件内重复塑形
- [ ] 保持 `createPagePilotServer()` 的对外行为不变，并补对应集成测试

## Phase D：benchmark 运维化

**Files:**
- Modify: `plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.js`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/report-writer.js`
- Modify: `plugins/page-pilot-skill/benchmarks/README.md`
- Modify: `plugins/page-pilot-skill/benchmarks/lib/benchmark-runner.check.js`

**Deliverables:**
- 总体耗时统计
- 慢场景 Top N
- full benchmark / self-check 边界说明
- benchmark 运维化测试

- [ ] 在 run summary 中加入总耗时、平均耗时与慢场景统计
- [ ] 在 Markdown 报告中加入慢场景 Top N 和耗时聚合
- [ ] 明确标注 `benchmark:test` 与完整 `benchmark` 的边界
- [ ] 为新增 summary/report 字段补自测

## Phase E：DX 与历史命名清理

**Files:**
- Modify: `plugins/page-pilot-skill/scripts/doctor.js`
- Modify: `plugins/page-pilot-skill/scripts/install-codex-mcp.js`
- Modify: `docs/development.md`
- Modify: `README.md`
- Modify: internal files with old naming noise as discovered

**Deliverables:**
- 增强版 doctor
- 更清楚的安装 / 错误提示
- 旧命名清理清单与完成结果

- [ ] 增强 `doctor`，补充对 `scripts/mcp-server.js`、插件目录、文档入口的自检
- [ ] 让 `install-codex-mcp.js` 在 Codex 缺失时给出更清楚的下一步提示
- [ ] 清理内部代码和测试中的残留旧命名
- [ ] 更新 `README.md` 与 `docs/development.md`，反映新的 DX 路径

## Phase F：验证与 Review 收尾

**Files:**
- Validate repository changes
- Run subagent reviews

**Deliverables:**
- 通过的 CI 级验证
- 通过的完整 benchmark
- 多轮 review 直到无重大问题

- [ ] 运行 `cd plugins/page-pilot-skill && npm run test:ci`
- [ ] 运行 `cd plugins/page-pilot-skill && npm run benchmark`
- [ ] 运行 `git diff --check`
- [ ] 发起多轮子代理 review，按问题修复并复验，直到 reviewer 返回无重大问题

