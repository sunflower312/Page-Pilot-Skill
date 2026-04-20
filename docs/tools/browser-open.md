# `browser_open` Contract

`browser_open` 用于打开一个新的 headless Playwright session，并把它交给后续的 scan、validate、generate、repair 闭环复用。

## Input

```json
{
  "url": "https://example.com",
  "viewport": {
    "width": 1440,
    "height": 960
  },
  "storageStatePath": "/tmp/state.json",
  "waitUntil": "domcontentloaded",
  "timeoutMs": 10000
}
```

## Output

```json
{
  "ok": true,
  "sessionId": "session-123",
  "title": "Example Domain",
  "url": "https://example.com/"
}
```

## Behavior Notes

- `storageStatePath` 只支持读取现有 storage state，不会自动保存新的 state。
- `waitUntil` 直接传给页面打开流程，用来控制首屏等待语义。
- 失败时会返回结构化 MCP 错误，而不是部分成功的 session。

## When Not To Use

不要在以下场景使用：

- 期望它自动恢复旧 session
- 期望它承担长期自治任务编排
