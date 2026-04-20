const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function normalizeGeneratedSource(code) {
  const source = String(code ?? '').trim();
  const withoutImports = source.replace(
    /^import\s+\{[^}]+\}\s+from\s+['"]@playwright\/test['"];\s*$/gm,
    ''
  ).trim();
  const wrappedMatch = withoutImports.match(
    /^([\s\S]*?)test\((?:'[^']*'|"[^"]*"),\s*async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{([\s\S]*)\}\s*\);\s*$/
  );
  if (!wrappedMatch) {
    return withoutImports;
  }

  const helperPrefix = wrappedMatch[1].trim();
  const body = wrappedMatch[2].trim();
  return [helperPrefix, body].filter(Boolean).join('\n\n');
}

async function resolveValue(value) {
  return typeof value === 'function' ? await value() : await value;
}

async function waitForAssertion(checker, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    try {
      await checker();
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError ?? new Error('Expectation timed out');
}

function createExpectationSubject(subject, options = {}) {
  return {
    async toBeVisible() {
      await waitForAssertion(async () => {
        const visible = typeof subject?.isVisible === 'function' ? await subject.isVisible() : false;
        if (!visible) {
          throw new Error('Expected locator to be visible');
        }
      }, options);
    },
    async toContain(expected) {
      const expectedValue = String(await resolveValue(expected));
      const runCheck = async () => {
        const actual = String(await resolveValue(subject));
        if (!actual.includes(expectedValue)) {
          throw new Error(`Expected "${actual}" to contain "${expectedValue}"`);
        }
      };

      if (options.retry === true || typeof subject === 'function') {
        await waitForAssertion(runCheck, options);
        return;
      }

      await runCheck();
    },
    async toHaveURL(expected) {
      const runCheck = async () => {
        const actual =
          typeof subject?.url === 'function'
            ? await subject.url()
            : String(await resolveValue(subject));
        if (expected instanceof RegExp) {
          if (!expected.test(actual)) {
            throw new Error(`Expected URL "${actual}" to match ${expected}`);
          }
          return;
        }
        const expectedValue = String(await resolveValue(expected));
        if (!actual.includes(expectedValue)) {
          throw new Error(`Expected URL "${actual}" to contain "${expectedValue}"`);
        }
      };

      if (typeof subject?.url === 'function' || options.retry === true || typeof subject === 'function') {
        await waitForAssertion(runCheck, options);
        return;
      }

      await runCheck();
    },
  };
}

function createRuntimeExpect() {
  const expect = (subject) => createExpectationSubject(subject);
  expect.poll = (producer, options = {}) =>
    createExpectationSubject(async () => await producer(), {
      retry: true,
      timeoutMs: options.timeout ?? 5000,
      intervalMs: options.interval ?? 100,
    });
  return expect;
}

export async function executeGeneratedPlaywrightCode(page, code) {
  const source = normalizeGeneratedSource(code);
  if (!source) {
    const error = new Error('Generated Playwright code is empty');
    error.code = 'PLAYWRIGHT_CODE_EMPTY';
    throw error;
  }

  const runner = new AsyncFunction('page', 'expect', source);
  return await runner(page, createRuntimeExpect());
}
