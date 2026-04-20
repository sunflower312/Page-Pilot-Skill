# Locator Strategy

Use locator strategies in this order:

1. `role` with accessible name
2. `label`
3. `testId`
4. `text`
5. `placeholder`
6. CSS fallback

Guidelines:

- Prefer user-facing semantics over structural selectors.
- Do not assume `testId` should automatically outrank stronger user-facing semantics.
- If two candidates are equally plausible, rank them with `browser_rank_locators`, then validate the winner with `browser_validate_playwright`.
- Avoid XPath unless there is no practical alternative.
- Treat raw class selectors as fragile by default.
