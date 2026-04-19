# Locator Strategy

Use locator strategies in this order:

1. `role` with accessible name
2. `label`
3. `text`
4. `placeholder`
5. `testId`
6. CSS fallback

Guidelines:

- Prefer user-facing semantics over structural selectors.
- If two candidates are equally plausible, validate them with `browser_run_actions`.
- Avoid XPath unless there is no practical alternative.
- Treat raw class selectors as fragile by default.
