# `browser_validate_playwright` Contract

`browser_validate_playwright` 用来验证一个**有限、结构化、可解释**的自动化假设。

它不是任意代码执行入口，也不是“把一大段外部脚本直接丢进去跑”的工具。

## Input

输入是结构化步骤数组。`browser_generate_playwright` 返回的 `generatedPlan` 在不超过 `12` 步时，可以直接作为这里的 `steps`；更长的计划需要调用方先分批，再逐批送入 `browser_validate_playwright`。

```json
{
  "sessionId": "session-123",
  "steps": [
    {
      "type": "fill",
      "locator": {
        "strategy": "role",
        "value": {
          "role": "textbox",
          "name": "Email",
          "exact": true
        }
      },
      "value": "qa@example.com"
    },
    {
      "type": "click",
      "locator": {
        "strategy": "role",
        "value": {
          "role": "button",
          "name": "Submit",
          "exact": true
        }
      },
      "expectedStateChange": {
        "kind": "dom_change",
        "textIncludes": "Saved"
      }
    }
  ]
}
```

## Validation Plan Bounds

- 当前公共验证计划最多允许 `12` 个步骤
- 输入必须是结构化步骤，不接受原始代码字符串
- 输入的 locator 必须使用公共 locator schema

## Output

输出包含：

- `validation`
- `steps`
- `evidence`
- `scan`
- `failureKind`
- `error`

其中 `steps[*]` 会补充：

- `locatorRanking`
- `locatorChoice`
- `fallbackLocatorChoices`
- `semanticTarget`
- `stableFingerprint`
- `assertionPlan`
- `codegenVerification`

## Allowed Scope

它允许验证：

- `navigate`
- `click`
- `fill`
- `press`
- `select`
- `check`
- `wait_for`
- `assert_text`
- `assert_url`
- `capture`

## Not Allowed

不要把 `browser_validate_playwright` 用在：

- 执行任意 Playwright 源码字符串
- 回放很长、很不透明的外部脚本
- 代替自治探索

## Relationship To `generatedPlan`

`generatedPlan` 是 code generation 产出的结构化验证计划。

公共验证路径只接受这种结构化计划或手写的等价步骤对象，不接受原始代码字符串。

当 `generatedPlan.length > 12` 时，调用方需要自己把它拆成多个 batch 依次复验；benchmark 内部也是按这个方式做 generated replay。
