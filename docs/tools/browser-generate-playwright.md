# `browser_generate_playwright` Contract

`browser_generate_playwright` 不是“把一次动作录制原样回放成代码”。

它基于当前 session 内**累计通过的 validation evidence** 生成 Playwright 代码，并把代码生成时采用的 locator 决策、断言计划和结构化 `generatedPlan` 一并返回。

## Input

```json
{
  "sessionId": "session-123",
  "testName": "submit form",
  "includeImports": true,
  "includeTestWrapper": true
}
```

## Output

```json
{
  "ok": true,
  "language": "ts",
  "framework": "playwright-test",
  "code": "import { test, expect } from '@playwright/test';\n...",
  "warnings": [],
  "locatorChoices": [],
  "fallbackLocatorChoices": [],
  "expectedStateChanges": [],
  "assertionPlan": [],
  "generatedPlan": [],
  "metrics": {
    "locatorCount": 2,
    "semanticLocatorRatio": 1,
    "cssFallbackRatio": 0,
    "assertionCount": 1,
    "codeLineCount": 12
  }
}
```

## Generation Inputs

生成逻辑会综合当前 session 中所有已通过的 validation 批次所沉淀下来的：

- `validation evidence`
- `locatorRanking`
- `codegenVerification`
- `semanticTarget`
- `stableFingerprint`

而不是只看“原始步骤里当时写了什么 locator”，也不是只取最后一批步骤的原始输入。

## Warning Schema

当前 warning 至少包括：

- `WAIT_PRESERVED`
- `CAPTURE_OMITTED`
- `CSS_FALLBACK_USED`
- `LOCATOR_NOT_FULLY_VERIFIED`

## `generatedPlan`

`generatedPlan` 是结构化输出，不是代码字符串摘要。它在不超过 `12` 步时可以直接再送回 `browser_validate_playwright` 做复验；如果更长，调用方需要先分批后再逐批复验。

## When Not To Use

不要在以下场景直接调用：

- 当前 session 没有成功的 validation evidence
- 你只是想执行任意 Playwright 片段
