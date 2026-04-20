# `browser_snapshot_dom` Contract

`browser_snapshot_dom` 用于把当前页面 DOM 写入 artifact 文件，方便调试隐藏结构、延迟渲染或验证失败后的页面状态。

## Input

```json
{
  "sessionId": "session-123"
}
```

## Output

```json
{
  "ok": true,
  "path": "/abs/path/to/artifacts/page-pilot-skill/session-123/dom-001.html"
}
```

## Behavior Notes

- 输出是当前页面 `content()` 的快照，不是结构化 scan 结果。
- 产物适合人工排查或附在 benchmark / 调试报告里，不适合直接当公共语义契约消费。

## When Not To Use

不要在以下场景使用：

- 想获取可直接排序的候选元素语义信息
- 想验证动作是否成功，这类问题应优先用 `browser_validate_playwright`
