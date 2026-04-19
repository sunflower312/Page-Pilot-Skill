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

- the next Playwright script should reuse the same headless session state
- you need a durable login or post-action context for later tests

## Default rule

Prefer `browser_scan` first. Artifacts are secondary evidence, not the default starting point.
