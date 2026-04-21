# Page Pilot Skill 工程收口设计文档

## 1. 目标

本轮工程收口不引入新的对外能力，目标是把现有 `Page Pilot Skill` 主闭环进一步产品化、协议化、可维护化。

当前主闭环保持不变：

1. `browser_open`
2. `browser_scan`
3. `browser_rank_locators`
4. `browser_probe`
5. `browser_validate_playwright`
6. `browser_generate_playwright`
7. `browser_repair_playwright`
8. 证据工具与关闭工具

本轮只处理以下五类工程收口：

1. 公共契约单一来源
2. `browser_scan` 内部 collector 解耦
3. 工具层 `schema / registration / handler / response` 继续分层
4. benchmark 运维化
5. DX 与历史命名噪音清理

## 2. 非目标

以下内容不属于本轮：

- 扩展新的公共 MCP 工具
- 再次改变 `Page Pilot Skill` 主定位
- 引入自治执行、长期记忆、site intelligence 或 planner
- 增加新的 benchmark 站点
- 改写 `browser_scan v3` 的公共输出协议

## 3. 收口原则

### 3.1 不改主契约，只改契约来源与实现边界

如果某项收口会改变外部调用方已依赖的字段，应先通过 spec/plan 明确并补测试，再实施。默认优先选择：

- 把既有契约变成单一来源
- 把重复定义改成共享注册表
- 把实现文件拆小但保持行为不变

### 3.2 文档、测试、实现必须由同一份工具清单驱动

公共工具集合不得再在以下位置分别硬编码：

- `docs/contracts.md`
- `docs/tools/*.md`
- `SKILL.md`
- `tests/unit/public-contracts.test.js`
- MCP 实际注册结果

本轮目标态是：

- 存在一份共享的公共工具契约注册表
- 文档测试与公共工具测试优先依赖这份注册表
- MCP 注册结果仍由服务实现决定，但测试必须以注册表作为期望来源

### 3.3 benchmark 的下一阶段重点是可运维，而不是扩能力

benchmark 已经能作为验收门禁，本轮不再新增能力指标，而是补：

- 耗时统计
- 慢场景识别
- 外站波动与真实失败的区分
- 对 full benchmark 和 benchmark self-check 的更清晰解释

### 3.4 `browser_scan` 解耦不改变 `scan.v3` 协议

`browser_scan` 的 collector 解耦只允许：

- 抽离 runtime helper
- 抽离去重与 coverage helper
- 抽离 collections / hints / focus 相关塑形逻辑

不允许在本轮把 `scan.v3` 重新改成别的协议。

## 4. 五类工程收口的设计

### 4.1 公共契约单一来源

新增一份共享公共工具注册表，至少包含：

- 工具 id
- 契约标题
- 对应 `docs/tools/*.md`
- 工具类别

它必须服务于：

- 公共契约测试
- 工具文档存在性测试
- `docs/contracts.md` 标题一致性测试

后续如需继续推进，可进一步扩展到文档生成或 schema 目录，但本轮不强制做自动生成。

### 4.2 `browser_scan` collector 解耦

当前 `structured-scan-runtime.js` 与 `structured-scan-shaping.js` 已经承担过多职责。本轮拆分目标是形成清晰的内部层次：

- runtime collector helpers
- dedupe / key helpers
- coverage / summary helpers
- collections helpers
- focus / hint helpers

拆分后要求：

- `structured-scan.js` 继续作为调度入口
- 公共输出不变
- collector 文件职责更单一

### 4.3 工具层继续分层

当前 `tools/*.js` 已从 `mcp-server.js` 中拆出，但仍然混合了：

- input schema 绑定
- tool registration
- handler glue
- response shaping

本轮目标态：

- 按功能子目录进一步拆开分析工具与 Playwright 工具
- 每个公共工具最好有独立 register helper
- 公共响应塑形逻辑向共享 helper 收敛

### 4.4 benchmark 运维化

benchmark 已有结果结构，但仍缺少面向长期运行的运维视图。本轮目标补上：

- 总体耗时统计
- 慢场景 Top N
- 外站不可用 / 慢阻塞 / 工具失败的更清晰聚合
- 报告中清楚标出 self-check 与 full benchmark 的边界

### 4.5 DX 与历史命名清理

本轮 DX 聚焦于：

- `doctor` 作为开发环境自检入口再加强
- `install-codex-mcp.js` 出错提示更清楚
- 仓库内部残留的旧 `Agent Browser` 命名继续清掉

优先清理：

- 内部变量名
- 测试辅助名
- 误导性的提示文案

## 5. 完成标准

本轮工程收口完成时，应满足：

1. 已存在新的工程收口 spec 与 plan，并与主设计文档一致。
2. 公共工具集合有共享注册表，公共契约测试不再硬编码两份工具清单。
3. `browser_scan` 内部至少完成一轮非破坏性解耦，collector / coverage / collections / focus 逻辑更清晰。
4. 工具层至少完成一轮按工具或按功能的 registration/handler 拆分。
5. benchmark 报告补充耗时与慢场景视图。
6. `doctor` 与安装脚本的 DX 提示更清楚。
7. 完成后必须跑 CI 级验证、完整 benchmark，并经过子代理 code review 直到没有大问题。

