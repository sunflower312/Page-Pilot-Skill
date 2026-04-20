# Workflows

## Scan a page and draft Playwright

1. `browser_open`
2. `browser_scan`
3. `browser_rank_locators`
4. Extract the most stable locator candidates from scan evidence
5. If confidence is low, validate the target interaction with `browser_validate_playwright`
6. Write the minimal Playwright snippet

## Validate a broken fill or click

1. Reproduce with a short `browser_validate_playwright` sequence
2. If the element is still ambiguous, inspect one focused question with `browser_probe`
3. If validation still fails, run `browser_repair_playwright`
4. Capture a screenshot only if visual state matters
5. Rewrite the locator based on evidence

## Validate a form flow before code generation

1. Open the page
2. Scan the structure
3. Run `fill -> click -> wait_for -> assert_text` through `browser_validate_playwright`
4. Generate Playwright only after the form result is backed by scan or validation evidence
5. If you already have a reusable storage-state file, pass it back into `browser_open` with `storageStatePath`; this public contract does not expose a separate save tool
