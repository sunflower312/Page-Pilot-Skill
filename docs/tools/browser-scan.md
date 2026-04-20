# `browser_scan` Contract

`browser_scan` 是 `Page Pilot Skill` 的页面语义对象模型入口。  
它的职责不是返回“原始 DOM”，而是返回让模型可以直接消费的页面语义结构。

## Input

```json
{
  "sessionId": "session-123",
  "detailLevel": "standard"
}
```

字段说明：

- `sessionId`
  - 来自 `browser_open`
- `detailLevel`
  - `brief`：更小、更快，适合先做页面摸底
  - `standard`：默认模式，适合大多数代码生成场景
  - `full`：保留更多语义细节，适合复杂页面和定位排查

## Output

```json
{
  "ok": true,
  "schemaVersion": "scan.v2",
  "title": "Example Domain",
  "url": "https://example.com/",
  "detailLevel": "standard",
  "document": {
    "title": "Example Domain",
    "url": "https://example.com/",
    "lang": "en",
    "readyState": "complete",
    "regions": {
      "main": [{ "name": "main" }],
      "dialogs": [],
      "forms": [{ "name": "login-form" }],
      "tables": [],
      "lists": [],
      "headings": [{ "level": 1, "text": "Sign in" }],
      "frames": [],
      "shadowRoots": []
    }
  },
  "summary": {
    "mainText": "Use semantic evidence instead of guessing the page structure.",
    "retainedInteractiveCount": 4,
    "truncated": false
  },
  "hints": {
    "primaryAction": {
      "label": "Submit",
      "locator": {
        "strategy": "role",
        "value": {
          "role": "button",
          "name": "Submit",
          "exact": true
        }
      }
    }
  },
  "interactives": {
    "inputs": [
      {
        "role": "textbox",
        "accessibleName": "Email",
        "visibleText": "Email",
        "description": "",
        "attributes": {
          "label": "Email",
          "placeholder": "name@example.com",
          "testId": ""
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
          "form": { "name": "login-form" },
          "dialog": null,
          "table": null,
          "list": null,
          "heading": { "text": "Sign in", "level": 1, "css": "h1" },
          "section": null,
          "landmark": null
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
            "matchCount": null,
            "stabilityReason": "semantic_role_name",
            "fallbackReason": null
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
          "reasons": ["semantic_role", "label", "in_form_context"]
        }
      }
    ]
  }
}
```

## Field Boundaries

这些字段必须明确区分，不能混成一个模糊字符串：

- `accessibleName`
  - 供辅助技术读取的语义名称
- `visibleText`
  - 用户在页面上能看到的文字
- `description`
  - 来自 `aria-description`、`aria-describedby` 或 `title` 的辅助描述
- `attributes.label`
  - 逻辑上的标签文本
- `attributes.placeholder`
  - 占位文本
- `attributes.testId`
  - 面向测试的稳定标识

## Element Semantics

### `state`

描述元素当前业务状态，例如：

- `disabled`
- `checked`
- `selected`
- `expanded`
- `pressed`
- `required`
- `readonly`
- `busy`
- `value`

### `actionability`

描述元素是否适合被自动化交互直接使用，例如：

- `visible`
- `enabled`
- `actionable`
- `editable`
- `clickable`
- `focusable`

### `localContext`

描述元素所在的局部上下文，帮助模型避免孤立理解元素：

- `form`
- `dialog`
- `table`
- `list`
- `heading`
- `section`
- `landmark`

### `geometry`

描述元素在当前视口中的几何信息。  
这不是主定位手段，但对“是否真的可见”“是否可能被遮挡”这类判断有帮助。

### `recommendedLocators`

这里是排序后的候选 locator 列表，供 `browser_generate_playwright` 和 `browser_rank_locators` 继续复用。

### `stableFingerprint`

这里必须来自稳定语义信号，而不是脆弱 DOM 路径。  
主要来源包括：

- role
- accessible name
- description
- test id
- context

### `confidence`

表示当前元素作为代码生成候选的综合置信度。  
它不是“页面置信度”，而是“这个元素以当前语义证据看有多适合直接进入自动化代码”。

## Not For

`browser_scan` 不该用在：

- 替代真实动作验证
- 替代只读 probe
- 返回整页原始 DOM
- 直接执行页面交互
