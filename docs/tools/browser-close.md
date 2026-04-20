# `browser_close` Contract

`browser_close` 用于关闭一个已存在的 session，并释放对应的页面、上下文与资源。

## Input

```json
{
  "sessionId": "session-123"
}
```

## Output

```json
{
  "ok": true
}
```

## Behavior Notes

- 如果 `sessionId` 不存在，工具会返回 `SESSION_NOT_FOUND`。
- 关闭后的 session 不应继续用于 scan、probe、validate 或 generate。

## When Not To Use

不要在以下场景使用：

- 还需要继续复用当前 session 的验证证据
- 只是想刷新页面，而不是释放整段 session
