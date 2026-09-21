import { z } from 'zod';
import {
  currencyCodeSchema,
  dateOnlySchema,
  optionalText,
  recordStatusSchema,
  withValidDateRange
} from './common.validators';

/**
 * Request-body schemas are STRICT: unknown/extra fields are rejected with a
 * 422 instead of being silently stripped.
 */

// --- Products --------------------------------------------------------------

export const createProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    description: optionalText(5000),
    basePrice: z.coerce.number().nonnegative('basePrice must be >= 0'),
    currencyCode: currencyCodeSchema,
    status: recordStatusSchema.optional()
  })
  .strict();

export const updateProductSchema = createProductSchema.partial();

// --- Marketplaces ----------------------------------------------------------

export const createMarketplaceSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    code: z.enum(['amazon', 'mercadolibre', 'own_store']),
    config: z.record(z.any()).optional().nullable(),
    status: recordStatusSchema.optional()
  })
  .strict();

export const updateMarketplaceSchema = createMarketplaceSchema.partial();

// --- Price lists -----------------------------------------------------------

export const createPriceListSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: optionalText(255),
    currencyCode: currencyCodeSchema.optional().nullable(),
    status: recordStatusSchema.optional()
  })
  .strict();

export const updatePriceListSchema = createPriceListSchema.partial();

export const setRelationsSchema = z
  .object({
    ids: z.array(z.string().uuid())
  })
  .strict();

// --- Prices ----------------------------------------------------------------

export const createPriceSchema = z
  .object({
    productId: z.string().uuid(),
    priceListId: z.string().uuid(),
    marketplaceId: z.string().uuid(),
    basePrice: z.coerce.number().nonnegative('basePrice must be >= 0'),
    currencyCode: currencyCodeSchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.optional().nullable(),
    status: recordStatusSchema.optional(),
    notes: optionalText(2000)
  })
  .strict()
  .superRefine(withValidDateRange);

/** References are immutable after creation: only value fields can change. */
export const updatePriceSchema = z
  .object({
    basePrice: z.coerce.number().nonnegative().optional(),
    currencyCode: currencyCodeSchema.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional().nullable(),
    status: recordStatusSchema.optional(),
    notes: optionalText(2000)
  })
  .strict()
  .superRefine(withValidDateRange);

export const calculatePriceSchema = z
  .object({
    productId: z.string().uuid(),
    priceListId: z.string().uuid(),
    marketplaceId: z.string().uuid(),
    basePrice: z.coerce.number().nonnegative(),
    currencyCode: currencyCodeSchema.optional(),
    at: z.coerce.date().optional()
  })
  .strict();

// --- Discounts -------------------------------------------------------------

const scopeToField: Record<string, string> = {
  product: 'productId',
  price_list: 'priceListId',
  marketplace: 'marketplaceId'
};

export const createDiscountSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    type: z.enum(['percentage', 'fixed']),
    value: z.coerce.number().nonnegative('value must be >= 0'),
    appliesTo: z.enum(['product', 'price_list', 'marketplace']),
    productId: z.string().uuid().optional().nullable(),
    priceListId: z.string().uuid().optional().nullable(),
    marketplaceId: z.string().uuid().optional().nullable(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.optional().nullable(),
    priority: z.coerce.number().int().nonnegative().optional(),
    status: recordStatusSchema.optional(),
    description: optionalText(2000)
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'percentage' && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'percentage discount value must be <= 100'
      });
    }

    // Exactly one scope FK must be set and it must match `appliesTo`.
    for (const [scope, field] of Object.entries(scopeToField)) {
      const value = (data as Record<string, unknown>)[field];
      const isSet = value !== undefined && value !== null;
      if (scope === data.appliesTo && !isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when appliesTo is '${data.appliesTo}'`
        });
      }
      if (scope !== data.appliesTo && isSet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} must be empty when appliesTo is '${data.appliesTo}'`
        });
      }
    }

    withValidDateRange(data, ctx);
  });

export const updateDiscountSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    type: z.enum(['percentage', 'fixed']).optional(),
    value: z.coerce.number().nonnegative().optional(),
    appliesTo: z.enum(['product', 'price_list', 'marketplace']).optional(),
    productId: z.string().uuid().optional().nullable(),
    priceListId: z.string().uuid().optional().nullable(),
    marketplaceId: z.string().uuid().optional().nullable(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional().nullable(),
    priority: z.coerce.number().int().nonnegative().optional(),
    status: recordStatusSchema.optional(),
    description: optionalText(2000)
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'percentage' && data.value !== undefined && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'percentage discount value must be <= 100'
      });
    }

    // When the scope changes, the matching reference is required and the
    // references of the other scopes must be cleared.
    if (data.appliesTo) {
      for (const [scope, field] of Object.entries(scopeToField)) {
        const value = (data as Record<string, unknown>)[field];
        const isSet = value !== undefined && value !== null;
        if (scope === data.appliesTo && !isSet) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when appliesTo is '${data.appliesTo}'`
          });
        }
        if (scope !== data.appliesTo && isSet) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} must be empty when appliesTo is '${data.appliesTo}'`
          });
        }
      }
    }

    withValidDateRange(data, ctx);
  });
