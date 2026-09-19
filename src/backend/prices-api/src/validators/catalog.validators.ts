import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.validators';

export const priceListAccessSchema = z
  .object({ priceListIds: z.array(uuidSchema).max(100) })
  .strict();

export const catalogQuerySchema = paginationQuerySchema
  .extend({
    priceListId: uuidSchema,
    marketplaceId: uuidSchema
  })
  .strict();

export const catalogMarketplacesQuerySchema = z
  .object({ priceListId: uuidSchema })
  .strict();

export const exportRequestSchema = z
  .object({
    priceListId: uuidSchema,
    marketplaceId: uuidSchema,
    format: z.enum(['csv', 'json', 'txt']),
    search: z.string().trim().max(200).optional()
  })
  .strict();
