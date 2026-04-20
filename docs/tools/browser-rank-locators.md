# `browser_rank_locators` Contract

`browser_rank_locators` 接收一个语义目标描述，并结合当前页面的 `browser_scan` 结果返回排序后的 locator 推荐。

它的目标不是“猜一个选择器”，而是给出一组**可解释、可验证、可直接落入 Playwright 代码**的候选。

## Input

示例：

```json
{
  "sessionId": "session-123",
  "target": {
    "role": "textbox",
    "accessibleName": "Email"
  },
  "detailLevel": "standard",
  "limit": 5
}
```

`target` 应优先使用语义字段：

- `role`
- `accessibleName`
- `visibleText`
- `description`
- `attributes.label`
- `attributes.placeholder`
- `attributes.testId`
- `stableFingerprint`

## Output

示例：

```json
{
  "ok": true,
  "query": {
    "role": "textbox",
    "accessibleName": "Email"
  },
  "matchCount": 1,
  "matches": [
    {
      "rank": 1,
      "score": 93,
      "semanticMatchCount": 3,
      "reasons": [
        "role_match",
        "accessible_name_exact_match",
        "label_exact_match",
        "actionable"
      ],
      "element": {
        "role": "textbox",
        "accessibleName": "Email"
      },
      "preferredLocator": {
        "strategy": "role",
        "value": {
          "role": "textbox",
          "name": "Email",
          "exact": true
        }
      },
      "locatorType": "role",
      "matchCount": 1,
      "playwrightExpression": "page.getByRole(\"textbox\", { name: \"Email\", exact: true })",
      "stabilityReason": "semantic_role_name",
      "fallbackReason": null,
      "confidence": {
        "score": 0.94,
        "reason": "semantic_fields_complete"
      },
      "locatorChoices": [
        {
          "locatorType": "role",
          "matchCount": 1,
          "playwrightExpression": "page.getByRole(\"textbox\", { name: \"Email\", exact: true })",
          "stabilityReason": "semantic_role_name",
          "fallbackReason": null,
          "confidence": "high"
        },
        {
          "locatorType": "label",
          "matchCount": 1,
          "playwrightExpression": "page.getByLabel(\"Email\")",
          "stabilityReason": "associated_label",
          "fallbackReason": null,
          "confidence": "high"
        }
      ]
    }
  ]
}
```

## Ranking Policy

默认偏好为：

1. `role`
2. `label`
3. `testId`
4. `text`
5. `placeholder`
6. `css`

这是候选质量排序，不是“只要字段存在就固定压过别的候选”。真实顺序仍会受到语义匹配强度、上下文和置信度影响。

## Candidate Fields

`matches[*].locatorChoices[*]` 是对外应优先消费的候选列表。每个候选至少包含：

- `locator`
- `locatorType`
- `playwrightExpression`
- `matchCount`
- `stabilityReason`
- `fallbackReason`
- `confidence`

`matchCount` 来自当前页面的实时校验，而不是静态猜测。

## CSS Fallback Policy

- CSS 只能作为最后兜底。
- 当候选退化到 CSS 时，必须返回 `fallbackReason: "css_fallback"`。
- 生成代码时，只有在更高语义候选都不可用时才允许选用 CSS。

## When Not To Use

不要把这个工具用在：

- 页面上根本还没有出现目标元素时
- 未先做 `browser_scan` 或缺少明确语义目标时
- 代替 `browser_validate_playwright` 做动作后状态验证

## Consistency Checklist

以下内容必须保持一致：

- `docs/contracts.md`
- `skills/page-pilot-skill/references/locator-strategy.md`
- `scripts/tools/analysis-tools.js`
- `scripts/lib/locator-ranking.js`
- `scripts/lib/semantic-target-ranking.js`

如果排序顺序、候选字段或 CSS 兜底策略发生变化，上述文件必须在同一次改动中同步更新。
