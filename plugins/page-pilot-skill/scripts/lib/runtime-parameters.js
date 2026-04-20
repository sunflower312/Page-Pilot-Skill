const RUNTIME_TOKEN_REGEX = /\{\{pagePilot\.(uniqueUsername|uniqueEmail|uniqueId)(?::([a-zA-Z0-9_-]+))?\}\}/g;
const OPTION_TOKEN_REGEX = /^\{\{pagePilot\.option:(first|last)\}\}$/;

function createNonce() {
  return `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function resolveRuntimeToken(runtime, kind, label = 'default') {
  if (kind === 'uniqueUsername') {
    return runtime.uniqueUsername(label);
  }
  if (kind === 'uniqueEmail') {
    return runtime.uniqueEmail(label);
  }
  return runtime.uniqueId(label);
}

function parameterizeStepValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => parameterizeStepValue(entry));
  }

  return value;
}

export function hasRuntimeTokens(value) {
  if (typeof value === 'string') {
    return /\{\{pagePilot\.(uniqueUsername|uniqueEmail|uniqueId)(?::([a-zA-Z0-9_-]+))?\}\}/.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((entry) => hasRuntimeTokens(entry));
  }

  return false;
}

export function collectRuntimeTokens(value) {
  const tokens = [];
  if (typeof value !== 'string') {
    if (Array.isArray(value)) {
      for (const entry of value) {
        tokens.push(...collectRuntimeTokens(entry));
      }
    }
    return tokens;
  }

  for (const match of value.matchAll(RUNTIME_TOKEN_REGEX)) {
    tokens.push({
      token: match[0],
      kind: match[1],
      label: match[2] ?? 'default',
    });
  }
  return tokens;
}

export function createRuntimeParameterResolver() {
  const cache = new Map();
  const stable = (key, builder) => {
    if (!cache.has(key)) {
      cache.set(key, builder());
    }
    return cache.get(key);
  };

  return {
    uniqueId(label = 'default') {
      return stable(`uniqueId:${label}`, () => `pp${createNonce()}`);
    },
    uniqueUsername(label = 'default') {
      return stable(`uniqueUsername:${label}`, () => `pp${createNonce()}`);
    },
    uniqueEmail(label = 'default') {
      return stable(`uniqueEmail:${label}`, () => `pp${createNonce()}@example.test`);
    },
    resolve(value) {
      return resolveRuntimeParameterizedValue(value, this);
    },
  };
}

export function resolveRuntimeParameterizedValue(value, runtime = createRuntimeParameterResolver()) {
  if (typeof value === 'string') {
    return value.replace(RUNTIME_TOKEN_REGEX, (_token, kind, label) => resolveRuntimeToken(runtime, kind, label ?? 'default'));
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveRuntimeParameterizedValue(entry, runtime));
  }

  return value;
}

export function parameterizeValidatedSteps(steps = []) {
  const runtimeTokens = new Map();

  for (const step of steps) {
    for (const field of [step.url, step.value, step.assertionPlan?.expected, step.expectedStateChange?.urlIncludes, step.expectedStateChange?.textIncludes]) {
      for (const runtimeToken of collectRuntimeTokens(field)) {
        runtimeTokens.set(runtimeToken.token, runtimeToken);
      }
    }
  }

  const parameterizedSteps = steps.map((step) => {
    const nextStep = { ...step };
    if ('url' in nextStep) {
      nextStep.url = parameterizeStepValue(nextStep.url);
    }
    if ('value' in nextStep) {
      nextStep.value = parameterizeStepValue(nextStep.value);
    }
    if (nextStep.assertionPlan?.expected) {
      nextStep.assertionPlan = {
        ...nextStep.assertionPlan,
        expected: parameterizeStepValue(nextStep.assertionPlan.expected),
      };
    }
    if (nextStep.expectedStateChange) {
      nextStep.expectedStateChange = {
        ...nextStep.expectedStateChange,
        urlIncludes: parameterizeStepValue(nextStep.expectedStateChange.urlIncludes),
        textIncludes: parameterizeStepValue(nextStep.expectedStateChange.textIncludes),
      };
    }
    return nextStep;
  });

  return {
    steps: parameterizedSteps,
    runtimeTokens: [...runtimeTokens.values()],
  };
}

export function runtimeTokenCodeExpression(token) {
  return `pagePilot.${token.kind}(${JSON.stringify(token.label ?? 'default')})`;
}

export function parseOptionToken(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(OPTION_TOKEN_REGEX);
  if (!match) {
    return null;
  }

  return {
    token: match[0],
    position: match[1],
  };
}
