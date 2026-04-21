# `browser_scan` Contract

`browser_scan` 是 `Page Pilot Skill` 的页面语义对象模型入口。  
它的职责不是返回“原始 DOM”，而是返回让模型可以直接消费的页面语义结构。

## Input

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
    "groups": ["buttons", "inputs"]
  }
}
```

字段说明：

- `sessionId`
  - 来自 `browser_open`
- `detailLevel`
  - `brief`：更小、更快，适合先做页面摸底
  - `standard`：默认模式，适合大多数代码生成场景
  - `full`：保留更多语义细节，适合复杂页面和定位排查
- `focus`
  - 可选的预算倾斜提示，不是强过滤器
  - 当前支持 `generic`、`form_fill`、`dialog`、`search_results`、`table_actions`、`navigation`、`content_extract`
  - `targetText` 会作为弱加权信号参与保留与排序，但不会做硬过滤
- `includeSpecializedControls`
  - 打开后返回扩展控件分组，例如 `radio`、`switch`、`tab`、`date/file` 等
- `verification`
  - 可选的轻量 locator 验证
  - 只会在受预算约束的少量高价值元素上运行，不替代 `browser_validate_playwright`
  - 当页面已经识别出 `primaryAction` 时，scan 会优先保留并验证这个主动作，即使它的控件组不在 `verification.groups` 里
  - 返回的是 locator inspection 结果，不是 scan 时的静态元素状态拷贝

## Output

```json
{
  "ok": true,
  "schemaVersion": "scan.v3",
  "title": "Example Domain",
  "url": "https://example.com/",
  "detailLevel": "standard",
  "focus": {
    "kind": "form_fill",
    "targetText": "workspace",
    "applied": true
  },
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
    "discoveredInteractiveCount": 8,
    "truncated": false,
    "coverage": {
      "discoveredByGroup": {
        "buttons": 2,
        "links": 1,
        "inputs": 3,
        "selects": 0,
        "textareas": 0,
        "checkboxes": 0,
        "specialized": {
          "radios": 1,
          "switches": 0,
          "sliders": 0,
          "tabs": 0,
          "options": 0,
          "menuItems": 0,
          "fileInputs": 0,
          "dateInputs": 0
        }
      }
    }
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
        "provenance": {
          "roleSource": "native_tag",
          "nameSource": "label",
          "labelSource": "label",
          "descriptionSource": "none",
          "origin": "document"
        },
        "origin": {
          "fromShadow": false,
          "shadowHostCss": "",
          "frameName": "",
          "frameTitle": "",
          "sameOriginFrame": null
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
            "score": 96,
            "confidence": "high",
            "reasons": ["semantic_role_name", "form_scope"],
            "playwrightExpression": "page.getByRole(\"textbox\", { name: \"Email\", exact: true })",
            "matchCount": null,
            "stabilityReason": "semantic_role_name",
            "fallbackReason": null,
            "verification": {
              "attempted": true,
              "unique": true,
              "matchCount": 1,
              "visible": true,
              "enabled": true,
              "usable": true,
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
          "score": 0.99,
          "reasons": ["semantic_role", "label", "strong_name_source", "strong_label_source", "in_form_context"]
        }
      }
    ]
  },
  "specializedControls": {
    "radios": [],
    "switches": [],
    "sliders": [],
    "tabs": [],
    "options": [],
    "menuItems": [],
    "fileInputs": [],
    "dateInputs": []
  },
  "collections": {
    "tables": [],
    "lists": [],
    "cards": [],
    "resultRegions": []
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
当 `verification.enabled` 打开时，top locator 还会带回轻量验证结果，但这仍然只是局部证据。
其中 `verification.visible / enabled / usable` 来自真实 locator inspection，而不是 `actionability` 的简单回填。

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

### `provenance`

这里描述语义值从哪里来，例如：

- `roleSource`
- `nameSource`
- `labelSource`
- `descriptionSource`
- `origin`

这让调用方知道一个名字到底来自 `aria-label`、`label`、`placeholder` 还是纯文本，而不是把它们混成同一种证据。

### `specializedControls`

这里承接扩展控件，不污染主 `interactives` 分组。当前包括：

- `radios`
- `switches`
- `sliders`
- `tabs`
- `options`
- `menuItems`
- `fileInputs`
- `dateInputs`

### `collections`

这里提供第一版集合区语义，用于帮助 code generation 理解表格、列表和结果区。

### `summary`

- `retainedInteractiveCount`
  - 最终保留在 scan 结果中的交互元素数量，包含主 `interactives` 与返回的 `specializedControls`
- `discoveredInteractiveCount`
  - 扫描时真实发现的交互元素总数，按 `coverage.discoveredByGroup` 汇总
- `truncated`
  - 只要任一 `coverage.omittedByGroup` 非零即为 `true`
- `coverage`
  - 对 discovered / retained / omitted / budget 的分组解释

### `hints`

- `possibleResultRegions`
  - 直接从 `collections.resultRegions` 派生，不再单独维护一套 list-only 摘要
- `formFields`
  - 在 `includeSpecializedControls=true` 且页面存在相关控件时，会逐步纳入 `radios / switches / fileInputs / dateInputs`

## Not For

`browser_scan` 不该用在：

- 替代真实动作验证
- 替代只读 probe
- 返回整页原始 DOM
- 直接执行页面交互
