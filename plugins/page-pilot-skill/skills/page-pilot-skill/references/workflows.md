# Workflows

## Read a page and draft Playwright

1. `browser_open`
2. `browser_scan`
3. Extract the most stable locator candidates
4. Write the minimal Playwright snippet
5. If confidence is low, validate with `browser_run_actions`

## Debug a broken fill or click

1. Reproduce with a short `browser_run_actions` sequence
2. If the element is still ambiguous, inspect attributes with `browser_execute_js`
3. Capture a screenshot only if visual state matters
4. Rewrite the locator based on evidence

## Validate a form flow

1. Open the page
2. Scan the structure
3. Run `fill -> click -> wait_for -> assert_text`
4. Save storage state if the resulting session should be reused
