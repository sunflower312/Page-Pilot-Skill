# Page Pilot Skill Public Tool Contracts

本文件是 `Page Pilot Skill` 公共 MCP 工具面的唯一真相文档。  
`SKILL.md`、参考文档、benchmark 说明和对外描述都应以这里为准。

## Public Tools

### `browser_open`

用途：打开页面并建立受控 session，供后续扫描、验证、生成和修复使用。

详细字段契约见 [browser-open.md](./tools/browser-open.md)。

输入示例：

```json
{
  "url": "https://example.com",
  "waitUntil": "domcontentloaded",
  "timeoutMs": 10000
}
```

输出示例：

```json
{
  "ok": true,
  "sessionId": "session-123",
  "title": "Example Domain",
  "url": "https://example.com/"
}
```

不该用在：

- 长时间自治任务编排
- 持续运行的代理式工作流

说明：

- 可读取现有 `storageStatePath`
- 当前公共契约不提供单独的“保存 storage state”工具

### `browser_scan`

用途：返回页面语义对象模型，供模型理解页面与候选元素。

详细字段契约见 [browser-scan.md](./tools/browser-scan.md)。

输入示例：

```json
{
  "sessionId": "session-123",
  "detailLevel": "standard"
}
```

输出示例：

```json
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "interactives": {
    "buttons": [
      {
        "role": "button",
        "accessibleName": "Submit",
        "visibleText": "Submit",
        "recommendedLocators": [
          {
            "strategy": "role",
            "value": {
              "role": "button",
              "name": "Submit",
              "exact": true
            }
          }
        ]
      }
    ]
  }
}
```

不该用在：

- 代替真实动作验证
- 代替局部只读探针

### `browser_rank_locators`

用途：根据 scan 结果对候选 locator 做排序，并输出可直接写入 Playwright 的推荐表达式。

详细字段契约见 [browser-rank-locators.md](./tools/browser-rank-locators.md)。

输入示例：

```json
{
  "sessionId": "session-123",
  "target": {
    "role": "button",
    "accessibleName": "Submit"
  },
  "limit": 3
}
```

输出示例：

```json
{
  "matches": [
    {
      "locatorType": "role",
      "playwrightExpression": "page.getByRole(\"button\", { name: \"Submit\", exact: true })",
      "matchCount": 1,
      "stabilityReason": "role_name_unique",
      "fallbackReason": null,
      "confidence": {
        "score": 0.98
      },
      "locatorChoices": [
        {
          "locatorType": "role",
          "playwrightExpression": "page.getByRole(\"button\", { name: \"Submit\", exact: true })",
          "matchCount": 1,
          "stabilityReason": "semantic_role_name",
          "fallbackReason": null,
          "confidence": "high"
        }
      ]
    }
  ]
}
```

不该用在：

- 猜测页面上根本不存在的目标
- 代替 scan 本身

### `browser_probe`

用途：执行模板化、只读、受限的局部探针，补充 scan 无法直接表达的信息。

详细字段契约见 [browser-probe.md](./tools/browser-probe.md)。

输入示例：

```json
{
  "sessionId": "session-123",
  "probe": {
    "template": "selector_snapshot",
    "selector": "#message",
    "includeGeometry": true
  }
}
```

输出示例：

```json
{
  "ok": true,
  "template": "selector_snapshot",
  "data": {
    "count": 1,
    "elements": [
      {
        "id": "message",
        "text": "Saved",
        "geometry": {
          "width": 120,
          "height": 24
        }
      }
    ]
  }
}
```

不该用在：

- 任意脚本执行
- 点击、填写、提交这类状态修改动作
- 整页替代 scan

### `browser_validate_playwright`

用途：验证一个有限的自动化假设，输出 locator、动作、断言和状态变化证据。

详细字段契约见 [browser-validate-playwright.md](./tools/browser-validate-playwright.md)。

输入示例：

```json
{
  "sessionId": "session-123",
  "steps": [
    {
      "type": "click",
      "locator": {
        "strategy": "role",
        "value": {
          "role": "button",
          "name": "Submit",
          "exact": true
        }
      }
    },
    {
      "type": "assert_text",
      "locator": {
        "strategy": "css",
        "value": "#message"
      },
      "value": "Saved"
    }
  ]
}
```

输出示例：

```json
{
  "ok": true,
  "validation": {
    "passed": true,
    "firstPass": true
  },
  "steps": [
    {
      "type": "click",
      "verification": {
        "usable": true,
        "unique": true
      }
    }
  ]
}
```

不该用在：

- 重放大而不透明的长脚本
- 自主探索全新流程

### `browser_generate_playwright`

用途：基于当前 session 中累计通过的 validation evidence 生成 Playwright 代码。

详细字段契约见 [browser-generate-playwright.md](./tools/browser-generate-playwright.md)。

输入示例：

```json
{
  "sessionId": "session-123",
  "testName": "submit form",
  "includeImports": true,
  "includeTestWrapper": true
}
```

输出示例：

```json
{
  "ok": true,
  "language": "ts",
  "framework": "playwright-test",
  "code": "import { test, expect } from '@playwright/test';\n..."
}
```

不该用在：

- 在没有成功 validation evidence 的 session 上直接生成代码
- 当成任意脚本模板引擎

### `browser_repair_playwright`

用途：在已有验证失败的前提下，做有限、以 locator 为中心的修复。

详细字段契约见 [browser-repair-playwright.md](./tools/browser-repair-playwright.md)。

输入示例：

```json
{
  "sessionId": "session-123",
  "steps": [
    {
      "type": "click",
      "locator": {
        "strategy": "text",
        "value": "Submit"
      }
    }
  ]
}
```

输出示例：

```json
{
  "ok": true,
  "repair": {
    "attempted": true,
    "repaired": true
  },
  "repairedArtifacts": {
    "code": "import { test, expect } from '@playwright/test';\\n...",
    "generatedPlan": []
  }
}
```

不该用在：

- 让系统自己探索新的页面流程
- 代替手动确定目标意图

### `browser_capture_screenshot`

用途：保存视觉证据。

详细字段契约见 [browser-capture-screenshot.md](./tools/browser-capture-screenshot.md)。

### `browser_snapshot_dom`

用途：保存 DOM 证据。

详细字段契约见 [browser-snapshot-dom.md](./tools/browser-snapshot-dom.md)。

### `browser_close`

用途：关闭 session 并释放资源。

详细字段契约见 [browser-close.md](./tools/browser-close.md)。

## Internal-Only Tools

以下能力不属于公共契约，只允许内部 benchmark 或调试在显式 gate 条件下使用：

- `browser_probe_script_internal`

内部能力不得写进 `SKILL.md` 的公共工具列表，也不得作为对外承诺宣传。
