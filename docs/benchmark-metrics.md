# Page Pilot Skill Benchmark Metrics

本文件定义 `Page Pilot Skill` benchmark 的代码质量指标，以及它们如何参与 Beta gate。

## 指标目标

benchmark 的首要目标不是衡量“代理是否自主完成长流程”，而是衡量：

- 页面语义扫描是否足够支撑代码生成
- locator 排序是否优先选择 Playwright 语义 locator
- 生成代码是否更短、更稳、更少依赖脆弱 CSS
- 生成后验证与修复是否能把候选代码收敛成可运行结果

## 指标定义

### Semantic Locator Ratio

语义 locator 数量占总 locator 数量的比例。语义 locator 指：

- `role`
- `label`
- `testId`
- `text`
- `placeholder`

`css` 不计入语义 locator。

### CSS Fallback Ratio

使用 `css` 作为最终生成 locator 的比例。该比例越低越好，用于限制“表面可运行，但高度脆弱”的代码生成结果。

### Unique Locator Hit Rate

生成后重新验证时，locator 唯一命中且可用的比例。该指标衡量 locator 质量，而不是页面是否偶然能走通。

### First Validation Pass Rate

结构化验证计划在第一次执行时直接通过的比例。该指标用于衡量 scan、排序和 codegen 的首轮质量。

### Generated Validation Pass Rate

由 `browser_generate_playwright` 产出的 `generatedPlan` 在独立验证 session 中通过的比例。该指标用于证明生成代码不是只在原始 session 中偶然成立。

### Repair Pass Rate

首轮验证失败但进入 repair 流程的场景中，修复后成功的比例。若没有 repair 尝试，则该指标为 `n/a`。

### Average Generated Code Line Count

生成代码的平均有效行数。它不是越短越好，而是用于防止生成结果回退成臃肿、重复、难维护的脚本。

## Beta Gate

当前 Beta gate 同时要求：

- registry 广度与每站场景深度满足最低覆盖要求
- 有足够多的场景产出代码质量数据
- 代码质量指标不低于 `benchmarks/lib/coverage-matrix.js` 中定义的阈值

任何一项失败，`npm run benchmark` 都应返回非零退出码。

## 报告解释

Markdown 与 JSON benchmark 报告都应至少包含：

- code-quality eligible 场景总数
- 因外部站点不可用而排除出代码质量分母的场景数
- 每项代码质量指标的汇总值
- per-scenario 的 code-quality 指标与生成代码片段

这使 benchmark 报告既能用于人工判读，也能作为后续自动分析输入。
