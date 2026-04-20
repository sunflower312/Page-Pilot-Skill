# `browser_capture_screenshot` Contract

`browser_capture_screenshot` 用于保存当前 session 页面的视觉证据，方便排查布局、可见性和状态变化问题。

## Input

```json
{
  "sessionId": "session-123",
  "fullPage": true
}
```

## Output

```json
{
  "ok": true,
  "path": "/abs/path/to/artifacts/page-pilot-skill/session-123/screenshot-001.png"
}
```

## Behavior Notes

- 输出是 artifact 文件路径，不直接内联图片内容。
- `fullPage` 默认为 `true`；如果只需要 viewport 证据，应显式传 `false`。

## When Not To Use

不要在以下场景使用：

- 代替 `browser_scan` 获取语义对象模型
- 代替 `browser_probe` 回答局部 DOM 问题
