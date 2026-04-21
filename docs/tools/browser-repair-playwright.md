# `browser_repair_playwright` Contract

`browser_repair_playwright` 是一个**有边界的修复工具**。

它不会自主探索新流程，只会在已有失败 validation 的前提下，尝试做有限修复并再次验证。

## Input

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

## Bounded Repair Scope

当前修复范围限定在：

- 候选重排
- locator 更换
- 在缺失时补默认 `stability` 配置

它不会：

- 自主探索新的页面流程
- 扩展出新的目标步骤
- 修正断言语义或预期值
- 自动重写等待策略之外的动作语义
- 执行任意 Playwright 代码字符串

## Output

当修复成功时，输出除了 validation 结果，还会包含 `repairedArtifacts`：

```json
{
  "ok": true,
  "repairAttempted": true,
  "repairStrategy": "locator_reordered",
  "revalidated": true,
  "repair": {
    "attempted": true,
    "repaired": true,
    "repairs": []
  },
  "repairedArtifacts": {
    "language": "ts",
    "framework": "playwright-test",
    "code": "import { test, expect } from '@playwright/test';\n...",
    "warnings": [],
    "locatorChoices": [],
    "fallbackLocatorChoices": [],
    "expectedStateChanges": [],
    "assertionPlan": [],
    "generatedPlan": [],
    "metrics": {},
    "source": {
      "sessionId": "session-123",
      "generatedFrom": "repair_validation_evidence",
      "startUrl": "https://example.com/form",
      "finalUrl": "https://example.com/form",
      "actionCount": 1,
      "assertionCount": 0
    }
  }
}
```

`repairedArtifacts` 的结构与 `browser_generate_playwright` 对齐，便于复用。
