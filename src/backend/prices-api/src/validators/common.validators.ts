import { z } from 'zod';

export const recordStatusSchema = z.enum(['active', 'inactive']);

export const uuidSchema = z.string().uuid('must be a valid UUID');

export const idParamSchema = z.object({
  id: uuidSchema
});

/** Query params accepted by every list endpoint (filters pass through). */
export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().max(200).optional(),
    status: z.string().max(40).optional(),
    sort: z.string().max(60).optional(),
    order: z.enum(['asc', 'desc']).optional()
  })
  .passthrough();

export const currencyCodeSchema = z
  .string()
  .trim()
  .length(3, 'currency code must be a 3-letter ISO code')
  .transform((value) => value.toUpperCase());

export const optionalText = (max: number) =>
  z.string().max(max).optional().nullable();

/** Rejects an end date that is not strictly after the start date. */
export function withValidDateRange<T extends { startDate?: Date | null; endDate?: Date | null }>(
  data: T,
  ctx: z.RefinementCtx
): void {
  if (data.startDate && data.endDate && data.endDate.getTime() <= data.startDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'endDate must be after startDate'
    });
  }
}
