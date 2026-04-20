# Artifact Debugging

## Use screenshot when

- the user cares about visible state
- you need to confirm a click changed the page
- you need evidence of a dialog, toast, or form result

## Use DOM snapshot when

- selectors are ambiguous
- hidden or generated nodes matter
- you need to inspect markup after an action sequence

## Use storage state when

- you already have a storage-state file from outside this public MCP contract
- the next Playwright script should reuse an existing durable login or post-action context

## Default rule

Prefer `browser_scan` first. Artifacts are secondary evidence, not the default starting point.
