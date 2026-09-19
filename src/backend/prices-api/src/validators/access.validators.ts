import { z } from 'zod';
import { currencyCodeSchema, optionalText, recordStatusSchema } from './common.validators';

/**
 * Request-body schemas are STRICT: unknown/extra fields are rejected with a
 * 422 instead of being silently stripped, so a client cannot smuggle columns
 * the API does not accept (e.g. tenantId, createdBy, id).
 */

// --- Auth ------------------------------------------------------------------

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(190),
    password: z.string().min(1).max(200)
  })
  .strict();

export const refreshSchema = z.object({}).strict();

// --- Tenants (companies) ---------------------------------------------------

export const createTenantSchema = z
  .object({
    commercialName: z.string().trim().min(1).max(150),
    legalName: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
    status: recordStatusSchema.optional(),
    defaultCurrency: currencyCodeSchema,
    notes: optionalText(2000)
  })
  .strict();

export const updateTenantSchema = createTenantSchema.partial();

// --- Users -----------------------------------------------------------------

/**
 * `tenantId` is intentionally NOT accepted: the tenant always comes from the
 * resolved request context, never from the client payload.
 */
export const createUserSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    email: z.string().trim().email().max(190),
    password: z.string().min(8, 'password must be at least 8 characters').max(200),
    roleId: z.string().uuid(),
    status: recordStatusSchema.optional()
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    email: z.string().trim().email().max(190).optional(),
    password: z.string().min(8).max(200).optional(),
    roleId: z.string().uuid().optional(),
    status: recordStatusSchema.optional()
  })
  .strict();

// --- Roles -----------------------------------------------------------------

export const createRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/, 'slug must be lowercase with - _ or :'),
    description: optionalText(255),
    status: recordStatusSchema.optional(),
    permissionSlugs: z.array(z.string().min(1)).optional()
  })
  .strict();

export const updateRoleSchema = createRoleSchema.partial();

export const assignPermissionsSchema = z
  .object({
    permissionSlugs: z.array(z.string().min(1))
  })
  .strict();

// --- API keys --------------------------------------------------------------

export const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    scopes: z.array(z.string().min(1)).min(1, 'at least one scope is required'),
    expiresAt: z.coerce.date().optional().nullable()
  })
  .strict();

export const updateApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    scopes: z.array(z.string().min(1)).min(1).optional(),
    expiresAt: z.coerce.date().optional().nullable()
  })
  .strict();
