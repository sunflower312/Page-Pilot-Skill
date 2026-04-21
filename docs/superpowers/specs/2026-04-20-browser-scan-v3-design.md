# browser_scan v3 设计文档

## 1. 背景与目标

`browser_scan` 目前已经具备稳定的页面语义对象模型骨架，但仍停留在 `scan.v2` 的第一阶段能力：

- 主采集仍以原生标签为主，现代组件页里的 ARIA role 控件覆盖不足
- 元素语义值已拆分，但语义来源尚未显式建模，调用方无法判断证据强弱
- 扫描预算和截断结果解释不够强，模型无法快速知道“漏掉了什么”
- `browser_scan` 仍更像结构化摘要，而不是“可直接服务 ranking / generate / repair 的语义证据入口”

本设计的目标是将 `browser_scan` 升级为 `scan.v3`，但**不把它做成重型验证器或浏览器代理**。v3 的主定位仍然是：

**一个更懂页面、更会说明证据来源、可选执行轻量验证、对复杂组件更友好的语义扫描器。**

## 2. 设计原则

### 2.1 保持主产品定位不变

`browser_scan v3` 必须继续服务 `Page Pilot Skill` 的主闭环：

`scan/analyze -> locator ranking -> bounded validation -> code generation -> verification/repair`

它不是新的 planner，不负责自治探索，也不能重新演变成任意脚本执行入口。

### 2.2 在 `scan.v2` 骨架上增量增强

v3 应采用“协议增强 + 采集扩面 + 轻验证补强”的策略，而不是推翻现有 `structured-scan` 链路重写。

现有链路保持不变：

- `analysis-tools.js`
- `structured-scan.js`
- `structured-scan-runtime.js`
- `structured-scan-shaping.js`

增强应尽量体现在：

- 输入参数扩展
- 语义字段加法
- 扫描运行时扩面
- 轻量验证 enrich
- 契约与测试升级

### 2.3 先增强“证据质量”，再增强“覆盖广度”

v3 的核心收益顺序是：

1. 让调用方知道扫描结果**为什么这么判断**
2. 让扫描结果知道自己**漏掉了什么**
3. 再扩大现代控件覆盖面
4. 最后再给少量高价值元素补轻验证证据

### 2.4 不破坏现有主交互分组

现有主分组：

- `buttons`
- `links`
- `inputs`
- `selects`
- `textareas`
- `checkboxes`

这些分组已经被 ranking、validate、generate、benchmark 假定。v3 不应把新的控件类型直接塞入这些分组，除非已有明确消费方支持。

新的复杂控件先进入扩展区：`specializedControls`。

## 3. 范围定义

### 3.1 直接纳入 v3 的内容

v3 第一版纳入以下能力：

1. provenance 语义来源字段
2. role-based interactive detection
3. Shadow DOM 交互采集扩面
4. `summary.coverage` 扫描预算解释
5. `focus` 输入与保留预算倾斜
6. 可选的轻量 locator 验证
7. `specializedControls` 扩展交互分组
8. `collections` 的第一版轻量对象模型

### 3.2 明确不纳入 v3 第一版的内容

以下内容不属于 v3 第一版：

- 全量 iframe 递归扫描
- scan 内执行重型验证或全量 locator 唯一性探测
- 任意脚本执行
- 把 `specializedControls` 直接混入主 `interactives` 分组
- 深度 card/row action 语义建模到足以驱动复杂 planner
- 任何自治探索、流程编排或长期站点记忆

## 4. 与总体 review 的前置约束

`browser_scan v3` 不是孤立升级，它必须建立在上一轮 GPT Pro 总体 review 指出的几项公共约束之上。

### 4.1 成功/失败 envelope 必须先统一

在继续扩大 scan 契约前，公共工具的 envelope 语义必须统一：

- 顶层 `ok: false` 只表示工具调用失败、输入非法、session 丢失或系统异常
- 业务结果失败必须写入业务字段，例如：
  - `validation.passed`
  - `repair.repaired`
  - `matchCount`
  - `result.status`
- 只要工具调用成功，顶层 `ok` 一律为 `true`

`browser_scan v3` 的输出示例、实现和 benchmark helper 必须遵守这条语义，不能再出现“文档写 `ok: true`，实现却不返回”或“业务失败被当成工具失败”的漂移。

### 4.2 文档示例必须进入自动校验范围

v3 所涉及的契约示例不能只靠人工维护。至少需要：

- `docs/tools/browser-scan.md` 的 fenced JSON 示例可被解析
- `docs/contracts.md` 中 `browser_scan` 的示例结构与真实结构保持一致
- 关键字段快照测试锁住：
  - `schemaVersion`
  - `recommendedLocators[*]`
  - `summary.coverage`
  - `specializedControls`
  - `collections`

### 4.3 locator fallback 输出一致性必须补测试

在增强 scan 内 locator 证据之前，必须锁住一条一致性规则：

如果 role exact miss、role fuzzy hit，则对外输出的：

- `locator`
- `playwrightExpression`
- `matchCount`

必须来自同一条最终 locator，不允许出现“表达式仍显示 exact，但计数来自 fuzzy fallback”的不一致情况。

### 4.4 剩余旧命名与 DX 清理属于并行收尾，不阻塞 v3 第一版

以下事项属于并行工程收尾，建议在 v3 推进过程中一并完成，但不作为 v3 的设计核心：

- `__agentBrowser*` 等旧内部命名清理为 `pagePilot*`
- `doctor.js` 增强为更完整的开发环境自检入口
- integration 测试与浏览器依赖的开发体验继续优化

### 4.5 v3 第二阶段收口项

在 v3 第一版已经落地的前提下，第二阶段必须继续收紧以下协议与结果语义：

1. `focus.targetText` 不能只出现在输入和输出里，必须真正参与弱加权匹配。
2. `summary.discoveredInteractiveCount / retainedInteractiveCount / truncated` 必须改成与 `coverage` 和 `specializedControls` 一致的统计口径。
3. Shadow DOM 去重必须使用 descendant 级稳定 key，避免同 host 下匿名同组控件误去重。
4. scan-time `verification.visible / enabled / usable` 必须来自真实 locator inspection，而不是 `entry.actionability`。
5. `hints.possibleResultRegions` 必须直接从 `collections.resultRegions` 派生。
6. `specializedControls` 在 form 场景下应逐步进入 `hints.formFields` 摘要。
7. 顶层 `ok` 只保留工具层单一注入点。

这些收口项不改变 `scan.v3` 的主方向，但会显著提高它对外作为协议产品的可信度。

## 5. browser_scan v3 输入契约

v3 在保留现有输入基础上新增以下可选字段。

```json
{
  "sessionId": "session-123",
  "detailLevel": "standard",
  "focus": {
    "kind": "form_fill",
    "targetText": "workspace"
  },
  "includeSpecializedControls": true,
  "verification": {
    "enabled": true,
    "maxPerElement": 1,
    "groups": ["buttons", "inputs", "selects", "checkboxes"]
  }
}
```

### 5.1 `detailLevel`

保留现有三档：

- `brief`
- `standard`
- `full`

它继续控制扫描密度，不承担任务意图表达。

### 5.2 `focus`

新增，可选。默认值：

```json
{ "kind": "generic" }
```

结构：

```json
{
  "kind": "generic | form_fill | dialog | search_results | table_actions | navigation | content_extract",
  "targetText": "optional string"
}
```

语义约束：

- `focus` 只影响预算倾斜、优先级和 hints
- `focus` 不做硬过滤
- `focus` 不得把 scan 变成规划器或任务执行器

### 5.3 `includeSpecializedControls`

新增，可选，默认 `false`。

语义约束：

- 只控制是否返回扩展控件区
- 不改变主 `interactives` 分组的结构
- 用于渐进引入 `radio / switch / slider / tab / option / menuitem / file / date`

### 5.4 `verification`

新增，可选，默认关闭。

结构：

```json
{
  "enabled": false,
  "maxPerElement": 1,
  "groups": [
    "buttons",
    "links",
    "inputs",
    "selects",
    "textareas",
    "checkboxes",
    "radios",
    "switches",
    "sliders",
    "tabs",
    "options",
    "menuItems",
    "fileInputs",
    "dateInputs"
  ]
}
```

语义约束：

- 只做轻量验证
- 默认关闭
- 每元素只验证前 `N` 个高价值 locator
- 不允许退化成 scan 内全量验证器

## 6. browser_scan v3 输出契约

v3 输出继续保留当前大框架：

- `document`
- `summary`
- `hints`
- `interactives`

同时新增：

- `schemaVersion: "scan.v3"`
- `focus`
- `summary.coverage`
- `specializedControls`
- `collections`

顶层 envelope 采用统一规则：

- 工具调用成功：`ok: true`
- 工具调用失败：`ok: false`
- 业务层不确定性和验证结果写入专用字段，不混用顶层 `ok`

### 6.1 页面级骨架

```json
{
  "ok": true,
  "schemaVersion": "scan.v3",
  "title": "Support workspace",
  "url": "https://example.com/workspace",
  "detailLevel": "standard",
  "focus": {
    "kind": "form_fill",
    "targetText": "workspace",
    "applied": true
  },
  "document": {
    "title": "Support workspace",
    "url": "https://example.com/workspace",
    "lang": "en",
    "readyState": "complete",
    "description": "Workspace for triage and validation.",
    "dialogs": [],
    "frames": [],
    "shadowHosts": [],
    "mains": [{ "name": "main" }],
    "regions": {
      "main": [{ "name": "main" }],
      "dialogs": [],
      "forms": [{ "name": "support-form" }],
      "tables": [{ "label": "queue", "headers": ["Ticket", "Owner", "Status"] }],
      "lists": [{ "label": "steps", "itemsCount": 3 }],
      "headings": [{ "level": 1, "text": "Support workspace" }],
      "frames": [],
      "shadowRoots": []
    },
    "detailLevel": "standard"
  }
}
```

### 6.2 `summary.coverage`

v3 新增：

```json
{
  "summary": {
    "mainText": "Support workspace for triaging queued requests...",
    "retainedInteractiveCount": 12,
    "discoveredInteractiveCount": 21,
    "truncated": true,
    "coverage": {
      "discoveredByGroup": {
        "buttons": 8,
        "links": 4,
        "inputs": 5,
        "selects": 2,
        "textareas": 1,
        "checkboxes": 1,
        "specialized": {
          "radios": 2,
          "tabs": 3
        }
      },
      "retainedByGroup": {
        "buttons": 5,
        "links": 2,
        "inputs": 3,
        "selects": 1,
        "textareas": 1,
        "checkboxes": 0,
        "specialized": {
          "radios": 0,
          "tabs": 0
        }
      },
      "omittedByGroup": {
        "buttons": 3,
        "links": 2,
        "inputs": 2,
        "selects": 1,
        "textareas": 0,
        "checkboxes": 1,
        "specialized": {
          "radios": 2,
          "tabs": 3
        }
      },
      "budget": {
        "maxInteractives": 12,
        "maxButtons": 12,
        "maxInputs": 6
      }
    }
  }
}
```

约束：

- `coverage` 必须解释截断发生在哪里
- `coverage` 用于帮助调用方决定是否提高 `detailLevel`、切换 `focus` 或继续使用 ranking/probe
- `coverage` 不是审计日志，不做全量原始节点统计导出

### 6.3 `specializedControls`

新增扩展区：

```json
{
  "specializedControls": {
    "radios": [],
    "switches": [],
    "sliders": [],
    "tabs": [],
    "options": [],
    "menuItems": [],
    "fileInputs": [],
    "dateInputs": []
  }
}
```

约束：

- 第一版只在 `includeSpecializedControls: true` 时返回
- 不得破坏现有 `interactives` 主 contract
- 后续 ranking 是否消费这些分组，由单独实现计划明确推进

### 6.4 `collections`

新增第一版轻量对象模型：

```json
{
  "collections": {
    "tables": [],
    "lists": [],
    "cards": [],
    "resultRegions": []
  }
}
```

第一版设计约束：

- 只抽取 top N 个高价值集合区
- 优先支持：
  - `tables`
  - `lists`
  - `resultRegions`
- `cards` 可为空，但字段保留
- 不做深度全量数据展开

## 7. 元素级 v3 设计

v3 在现有元素对象上新增三组关键字段：`id`、`provenance`、`origin`，并扩展 locator 级 `verification`。

### 7.1 元素级示例

```json
{
  "id": "scan-el-12",
  "group": "inputs",
  "role": "textbox",
  "accessibleName": "Email",
  "visibleText": "Email",
  "description": "",
  "provenance": {
    "roleSource": "native_tag",
    "nameSource": "label",
    "labelSource": "label",
    "descriptionSource": "none",
    "origin": "document"
  },
  "attributes": {
    "label": "Email",
    "placeholder": "name@example.com",
    "testId": "",
    "inputType": "email",
    "href": "",
    "controlType": "text"
  },
  "state": {
    "disabled": false,
    "required": true,
    "readonly": false,
    "checked": null,
    "selected": null,
    "expanded": null,
    "pressed": null,
    "busy": null,
    "value": ""
  },
  "actionability": {
    "visible": true,
    "enabled": true,
    "actionable": true,
    "editable": true,
    "clickable": false,
    "focusable": true
  },
  "localContext": {
    "form": { "name": "support-form" },
    "dialog": null,
    "table": null,
    "list": null,
    "heading": { "text": "Support workspace", "level": 1, "css": "h1" },
    "section": null,
    "landmark": { "name": "main", "css": "main" }
  },
  "origin": {
    "fromShadow": false,
    "shadowHostCss": "",
    "frameName": "",
    "frameTitle": "",
    "sameOriginFrame": null
  },
  "geometry": {
    "x": 180,
    "y": 240,
    "width": 320,
    "height": 36,
    "viewportVisibleRatio": 1
  },
  "recommendedLocators": [
    {
      "locator": {
        "strategy": "role",
        "value": {
          "role": "textbox",
          "name": "Email",
          "exact": true
        }
      },
      "score": 0.92,
      "confidence": "high",
      "reasons": ["semantic_role_name", "form_scope"],
      "playwrightExpression": "page.getByRole(\"textbox\", { name: \"Email\", exact: true })",
      "matchCount": 1,
      "stabilityReason": "semantic_role_name",
      "fallbackReason": null,
      "verification": {
        "attempted": true,
        "unique": true,
        "matchCount": 1,
        "visible": true,
        "enabled": true,
        "action": "fill",
        "source": "scan"
      }
    }
  ],
  "stableFingerprint": {
    "role": "textbox",
    "accessibleName": "Email",
    "description": "",
    "testId": "",
    "context": {
      "withinDialog": false,
      "withinForm": true,
      "withinMain": true
    }
  },
  "confidence": {
    "level": "high",
    "score": 0.91,
    "reasons": ["semantic_role", "label", "in_form_context"],
    "quality": "verified"
  }
}
```

### 7.2 `provenance`

`provenance` 的目标是告诉调用方：**这个语义值从哪里来**。

建议枚举：

- `roleSource`
  - `native_tag`
  - `aria_role`
  - `implicit`
  - `derived`
- `nameSource`
  - `aria-label`
  - `aria-labelledby`
  - `inner-text`
  - `label`
  - `placeholder`
  - `value`
  - `title`
  - `none`
- `labelSource`
  - `label`
  - `wrapped-label`
  - `aria-labelledby`
  - `table-row`
  - `nearby-sibling`
  - `none`
- `descriptionSource`
  - `aria-description`
  - `aria-describedby`
  - `title`
  - `none`
- `origin`
  - `document`
  - `shadow_dom`
  - `iframe`

### 7.3 `origin`

`origin` 用于表达元素来自页面哪个运行时边界：

- 是否来自 open Shadow DOM
- 是否处于 frame 中
- 是否来自 same-origin frame

它不是语义来源，而是运行时来源。

### 7.4 locator-level `verification`

如果启用轻量验证，则 `recommendedLocators[*]` 增加：

- `attempted`
- `unique`
- `matchCount`
- `visible`
- `enabled`
- `action`
- `source`

约束：

- 这是元素级证据，不影响顶层 `ok`
- 失败不等于工具失败
- scan 内验证结果只能作为轻证据，不能替代 `browser_validate_playwright`

## 8. v3 行为约束

### 8.1 角色型控件覆盖策略

运行时采集必须从“tag-only 主体”升级为“tag + ARIA role 双通道”。

第一版建议纳入：

- `role="button"`
- `role="link"`
- `role="textbox"`
- `role="searchbox"`
- `role="combobox"`
- `role="checkbox"`
- `role="radio"`
- `role="switch"`
- `role="slider"`
- `role="tab"`
- `role="option"`
- `role="menuitem"`
- `contenteditable` 文本输入区域

### 8.2 Shadow DOM 扩面策略

在 open Shadow DOM 中，至少应补齐：

- `a[href]`
- role-based widget
- `contenteditable`

### 8.3 轻量验证策略

scan 内的轻量验证必须满足：

- 默认关闭
- 预算受限
- 只对少量高价值元素执行
- 优先针对：
  - `hints.primaryAction`
  - `hints.formFields`
  - retained 结果中的前 N 个高优先级元素

### 8.4 focus 策略

`focus` 只允许影响：

- retain 排序加权
- hints 提示
- collection 优先保留

`focus` 不允许：

- 变成任务规划器
- 过滤掉页面上的其他核心结构
- 导致 contract 随任务变化而不稳定

## 9. 文件级改造方向

### 9.1 `scripts/tools/analysis-tools.js`

职责：

- 扩展 `browser_scan` 输入 schema：`focus`、`includeSpecializedControls`、`verification`
- 把新参数传入 `collectStructuredPageData()`
- 在 `verification.enabled` 时调用 scan 级轻量 enrich

不应承担：

- 复杂 shaping 逻辑
- 运行时 DOM 采集细节

### 9.2 `scripts/lib/structured-scan.js`

职责：

- 总调度层
- runtime raw collect
- normalize/shaping
- 可选 verification enrich

目标：

- 保持 orchestrator 薄
- 不在这里重新塞回庞大的浏览器侧采集逻辑

### 9.3 `scripts/lib/structured-scan-runtime.js`

这是 v3 第一阶段的主战场。应新增：

- `getLabelWithSource()`
- `getNameWithSource()`
- `getDescriptionWithSource()`
- `getRoleWithSource()`
- role-based 主遍历
- Shadow DOM 扩 coverage
- `discoveredCounts`
- 轻量 `collections` 原始采样

### 9.4 `scripts/lib/structured-scan-shaping.js`

这是 v3 第二主战场。应新增：

- `focus` 写回与预算倾斜
- `specializedControls` 组装
- `summary.coverage`
- `provenance`
- `origin`
- `collections`
- `confidence` 对 provenance 更敏感

### 9.5 `scripts/tools/locator-choices.js`

职责：

- 为 scan 的 retained entry 做受预算约束的 locator 轻验证 enrich

### 9.6 `scripts/lib/locator-ranking.js`

职责调整：

- score 必须感知 provenance
- 例如 `placeholder` 来源的 `role+name` 不应和真正 `label` 来源等权

### 9.7 `scripts/lib/interactive-priority.js`

职责调整：

- 支持 `focus.kind` 带来的预算倾斜
- 不推翻现有 priority 模型，只做增益

### 9.8 `scripts/lib/semantic-target-ranking.js`

要求：

- 后续如 ranking 要识别扩展控件，必须能 flatten `specializedControls`
- 不允许 scan 扫到了扩展控件，ranking 却永远看不到

### 9.9 `scripts/lib/playwright-locator-expression.js`

要求：

- 确保新增 role 的 Playwright 表达式生成合法
- 至少覆盖：
  - `radio`
  - `switch`
  - `slider`
  - `tab`
  - `option`
  - `menuitem`

## 10. 测试策略

v3 必须以契约测试和边界测试为主，而不是只靠真人肉眼看 scan 输出。

### 10.1 单元测试

必须补的测试类型：

- provenance 来源分支：
  - `aria-label`
  - `aria-labelledby`
  - `label`
  - `placeholder`
  - `inner-text`
- role-based widget：
  - `div[role="button"]`
  - `div[role="textbox"]`
  - `div[role="switch"]`
  - `div[role="tab"]`
- Shadow DOM coverage：
  - shadow 内 `a[href]`
  - shadow 内 role widget
- `summary.coverage`：
  - discovered / retained / omitted
- `focus` 倾斜：
  - `form_fill`
  - `dialog`
- `specializedControls`：
  - `radio`
  - `date`
  - `file`
  - `range`
  - `tab`

### 10.2 ranking 相关测试

必须补：

- provenance 影响 score
- `placeholder` 来源的 role/name 不应与真实 label 同分
- role exact miss / fuzzy hit 时，`locator / playwrightExpression / matchCount` 三者一致

### 10.3 contract 测试

必须补：

- `browser-scan.md` 示例 JSON 与 `scan.v3` 契约一致
- `docs/contracts.md` 中 `browser_scan` 示例字段与真实结构一致
- `schemaVersion === scan.v3`

### 10.4 integration 测试

应新增或强化：

- role-based button
- contenteditable textbox
- Shadow DOM link/button
- table row action 概要采集
- `verification.enabled` 时 locator verification 字段存在

## 11. 分阶段实施建议

### Phase A：最小可落地 v3

先做：

- provenance
- role-based detection
- Shadow DOM 扩 coverage
- `summary.coverage`

这是收益最大、风险最低的一步。

### Phase B：轻量验证

再做：

- `verification.enabled`
- top locator 轻验证
- `recommendedLocators[*].verification`

### Phase C：任务感知与 collection 摘要

最后做：

- `focus`
- `collections.tables`
- `collections.lists`
- `collections.resultRegions`

`cards` 可以保留字段但延后做深。

## 12. 完成标准

`browser_scan v3` 的完成标准定义为：

1. `schemaVersion` 升级为 `scan.v3`
2. 现有主 `interactives` 分组不被破坏
3. 每个 retained entry 都带 `provenance`
4. `summary.coverage` 能说明截断发生在哪里
5. 至少支持 role-based widget 和 Shadow DOM link/widget 采集
6. 在 `verification.enabled` 时，top locator 能带回轻量验证结果
7. 契约文档、示例 JSON 和实际结构通过自动测试保持一致
8. 顶层 `ok` 语义与公共 envelope 规则一致
