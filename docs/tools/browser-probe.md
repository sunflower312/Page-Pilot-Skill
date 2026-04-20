# `browser_probe` Contract

`browser_probe` 是 `Page Pilot Skill` 的受控只读探针。

它只负责补充 `browser_scan` 难以直接表达的局部信息，不负责点击、填写、提交，也不负责执行任意脚本。

## Public Templates

当前公共模板只有两类：

- `document_snapshot`
- `selector_snapshot`

## Input

### `document_snapshot`

```json
{
  "sessionId": "session-123",
  "probe": {
    "template": "document_snapshot",
    "includeTitle": true,
    "includeUrl": true,
    "includeText": true,
    "maxTextLength": 2000,
    "timeoutMs": 3000
  }
}
```

### `selector_snapshot`

```json
{
  "sessionId": "session-123",
  "probe": {
    "template": "selector_snapshot",
    "selector": "#status",
    "maxItems": 5,
    "includeText": true,
    "includeGeometry": true,
    "timeoutMs": 3000
  }
}
```

## Output Bounds

- 只返回可序列化数据
- 模板内有字段级截断，例如文本长度和元素数量
- 最终序列化结果若超过内部大小上限，会返回 `PROBE_RESULT_TOO_LARGE`
- probe 超时会返回探针超时错误

## Readonly Boundary

公共 `browser_probe` 不允许：

- 修改 DOM
- 触发点击、提交、聚焦、失焦或事件派发
- 修改 `localStorage` / `sessionStorage`
- 导航、刷新、修改 `history`
- 发起网络副作用

## Internal-Only Capability

仓库内部仍保留 `browser_probe_script_internal` 作为 benchmark / 调试用只读脚本入口，但它：

- 不属于公共契约
- 只在显式 gate 条件下注册
- 不得写入 `SKILL.md` 的公共工具列表

## When Not To Use

不要把 `browser_probe` 用在：

- 代替 `browser_scan` 做整页分析
- 代替 `browser_validate_playwright` 做动作验证
- 需要真正改页面状态的场景
