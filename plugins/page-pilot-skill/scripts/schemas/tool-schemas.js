import { z } from 'zod';

export const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const waitUntilSchema = z.enum(['commit', 'domcontentloaded', 'load', 'networkidle']);

const roleLocatorSchema = z.object({
  strategy: z.literal('role'),
  value: z.object({
    role: z.string().min(1),
    name: z.string().min(1),
    exact: z.boolean().optional().default(true),
  }),
});

const stringLocatorStrategies = ['label', 'text', 'placeholder', 'testId', 'css'];
const stringLocatorSchemas = stringLocatorStrategies.map((strategy) =>
  z.object({
    strategy: z.literal(strategy),
    value: z.string().min(1),
  })
);

export const locatorSchema = z.union([roleLocatorSchema, ...stringLocatorSchemas]);

export const semanticTargetSchema = z.object({
  role: z.string().min(1).optional(),
  accessibleName: z.string().min(1).optional(),
  visibleText: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  attributes: z
    .object({
      label: z.string().min(1).optional(),
      placeholder: z.string().min(1).optional(),
      testId: z.string().min(1).optional(),
    })
    .partial()
    .optional(),
  css: z.string().min(1).optional(),
  stableFingerprint: z
    .object({
      role: z.string().min(1).optional(),
      accessibleName: z.string().min(1).optional(),
      testId: z.string().min(1).optional(),
      context: z
        .object({
          withinDialog: z.boolean().optional(),
          withinForm: z.boolean().optional(),
          withinMain: z.boolean().optional(),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),
});

export const actionStabilitySchema = z
  .object({
    after: z.enum(['auto', 'none']).default('auto').optional(),
    timeoutMs: z.number().int().positive().optional(),
    settleMs: z.number().int().positive().optional(),
    minObserveMs: z.number().int().positive().optional(),
  })
  .optional();

export const expectedStateChangeSchema = z
  .object({
    kind: z.enum(['any', 'url_change', 'dom_change', 'text_change', 'no_change']).default('any').optional(),
    urlIncludes: z.string().min(1).optional(),
    textIncludes: z.string().min(1).optional(),
  })
  .optional();

const locatableActionFields = {
  locator: locatorSchema,
  fallbackLocators: z.array(locatorSchema).optional(),
  stability: actionStabilitySchema,
  expectedStateChange: expectedStateChangeSchema,
};

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    url: z.string().min(1),
    waitUntil: waitUntilSchema.optional(),
    stability: actionStabilitySchema,
    expectedStateChange: expectedStateChangeSchema,
  }),
  z.object({
    type: z.literal('click'),
    ...locatableActionFields,
  }),
  z.object({
    type: z.literal('fill'),
    ...locatableActionFields,
    value: z.string(),
  }),
  z.object({
    type: z.literal('press'),
    ...locatableActionFields,
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal('select'),
    ...locatableActionFields,
    value: z.union([z.string(), z.array(z.string())]),
  }),
  z.object({
    type: z.literal('check'),
    ...locatableActionFields,
    checked: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('capture'),
    ...locatableActionFields,
  }),
  z.object({
    type: z.literal('wait_for'),
    value: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('assert_text'),
    ...locatableActionFields,
    value: z.string(),
  }),
  z.object({
    type: z.literal('assert_url'),
    value: z.string().min(1),
  }),
]);

const publicProbeSchemas = [
  z.object({
    template: z.literal('document_snapshot'),
    includeTitle: z.boolean().optional(),
    includeUrl: z.boolean().optional(),
    includeText: z.boolean().optional(),
    maxTextLength: z.number().int().positive().max(4000).optional(),
    timeoutMs: z.number().int().positive().max(10000).default(3000).optional(),
  }),
  z.object({
    template: z.literal('selector_snapshot'),
    selector: z.string().min(1),
    maxItems: z.number().int().positive().max(20).optional(),
    includeText: z.boolean().optional(),
    includeGeometry: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(10000).default(3000).optional(),
  }),
];

export const probeSchema = z.discriminatedUnion('template', publicProbeSchemas);
export const internalProbeSchema = z.object({
  source: z.string().min(1),
  timeoutMs: z.number().int().positive().max(30000).default(3000).optional(),
});

export const MAX_VALIDATION_STEPS = 12;
