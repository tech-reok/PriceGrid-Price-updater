import {
  assignPermissionsSchema,
  createApiKeySchema,
  createRoleSchema,
  createTenantSchema,
  createUserSchema,
  loginSchema,
  preferredLocaleSchema,
  updateApiKeySchema,
  updatePreferencesSchema,
  updateRoleSchema,
  updateTenantSchema,
  updateUserSchema
} from '../../src/validators/access.validators';
import {
  calculatePriceSchema,
  createDiscountSchema,
  createMarketplaceSchema,
  createPriceListSchema,
  createPriceSchema,
  createProductSchema,
  setRelationsSchema,
  updateDiscountSchema,
  updatePriceSchema,
  updateProductSchema
} from '../../src/validators/pricing.validators';
import { idParamSchema, paginationQuerySchema } from '../../src/validators/common.validators';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../../src/common/i18n/supported-locales';

describe('common validators', () => {
  it('validates uuids', () => {
    expect(idParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: '3f1d9d3a-1c1e-4b1e-9a5e-1b2c3d4e5f60' }).success).toBe(true);
  });

  it('coerces pagination parameters', () => {
    const parsed = paginationQuerySchema.parse({ page: '2', limit: '50', order: 'asc' });
    expect(parsed).toMatchObject({ page: 2, limit: 50, order: 'asc' });
  });

  it('rejects a limit above 100 and a bad order', () => {
    expect(paginationQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ order: 'sideways' }).success).toBe(false);
  });

  it('passes unknown filter parameters through', () => {
    const parsed = paginationQuerySchema.parse({ productId: 'abc' });
    expect((parsed as any).productId).toBe('abc');
  });
});

describe('auth validators', () => {
  it('requires a valid email and a password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('tenant validators', () => {
  const valid = {
    commercialName: 'Acme',
    legalName: 'Acme SA',
    slug: 'acme-co',
    defaultCurrency: 'mxn'
  };

  it('accepts a valid company and uppercases the currency', () => {
    const parsed = createTenantSchema.parse(valid);
    expect(parsed.defaultCurrency).toBe('MXN');
  });

  it('rejects a non kebab-case slug', () => {
    expect(createTenantSchema.safeParse({ ...valid, slug: 'Acme Co' }).success).toBe(false);
    expect(createTenantSchema.safeParse({ ...valid, slug: 'acme_co' }).success).toBe(false);
  });

  it('requires a 3-letter currency code', () => {
    expect(createTenantSchema.safeParse({ ...valid, defaultCurrency: 'MX' }).success).toBe(false);
  });

  it('allows partial updates', () => {
    expect(updateTenantSchema.safeParse({ commercialName: 'New' }).success).toBe(true);
    expect(updateTenantSchema.safeParse({ slug: 'Bad Slug' }).success).toBe(false);
  });
});

describe('user validators', () => {
  const valid = {
    name: 'User',
    email: 'user@example.com',
    password: 'Password!123',
    roleId: '3f1d9d3a-1c1e-4b1e-9a5e-1b2c3d4e5f60'
  };

  it('accepts a valid user', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it('enforces the minimum password length', () => {
    expect(createUserSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });

  it('requires a uuid role', () => {
    expect(createUserSchema.safeParse({ ...valid, roleId: 'abc' }).success).toBe(false);
  });

  it('supports partial updates', () => {
    expect(updateUserSchema.safeParse({ name: 'N' }).success).toBe(true);
    expect(updateUserSchema.safeParse({ password: 'short' }).success).toBe(false);
  });

  it('never accepts a client-supplied tenantId (it comes from the request context)', () => {
    const uuid = '3f1d9d3a-1c1e-4b1e-9a5e-1b2c3d4e5f60';

    expect(createUserSchema.safeParse({ ...valid, tenantId: uuid }).success).toBe(false);
    expect(updateUserSchema.safeParse({ tenantId: uuid }).success).toBe(false);
  });
});

describe('preferred locale validators', () => {
  const uuid = '3f1d9d3a-1c1e-4b1e-9a5e-1b2c3d4e5f60';
  const validUser = {
    name: 'User',
    email: 'user@example.com',
    password: 'Password!123',
    roleId: uuid
  };

  it('accepts exactly the two canonical locales and nothing else', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(preferredLocaleSchema.safeParse(locale).success).toBe(true);
    }
    // The allowlist is deliberately narrow; adding a language must be a code change.
    expect([...SUPPORTED_LOCALES]).toEqual(['es-419', 'en-US']);
  });

  it('rejects language-only, regional, wrongly cased and unsupported values', () => {
    for (const rejected of ['es', 'en', 'es-MX', 'en-GB', 'ES-419', 'en-us', 'pt-BR', '']) {
      expect(preferredLocaleSchema.safeParse(rejected).success).toBe(false);
    }
  });

  it('rejects non-string, null and missing values', () => {
    for (const rejected of [null, undefined, 42, {}, []]) {
      expect(preferredLocaleSchema.safeParse(rejected).success).toBe(false);
    }
  });

  it('accepts the documented self-service body', () => {
    expect(updatePreferencesSchema.parse({ preferredLocale: 'en-US' })).toEqual({
      preferredLocale: 'en-US'
    });
  });

  it('rejects an unsupported locale and an empty body for the self-service endpoint', () => {
    expect(updatePreferencesSchema.safeParse({ preferredLocale: 'es' }).success).toBe(false);
    expect(updatePreferencesSchema.safeParse({ preferredLocale: 'en' }).success).toBe(false);
    expect(updatePreferencesSchema.safeParse({}).success).toBe(false);
  });

  it('rejects extra fields, so a client cannot target another user', () => {
    expect(
      updatePreferencesSchema.safeParse({ preferredLocale: 'en-US', userId: uuid }).success
    ).toBe(false);
    expect(
      updatePreferencesSchema.safeParse({ preferredLocale: 'en-US', id: uuid }).success
    ).toBe(false);
    expect(
      updatePreferencesSchema.safeParse({ preferredLocale: 'en-US', tenantId: uuid }).success
    ).toBe(false);
  });

  it('defaults create to es-419 when the locale is omitted', () => {
    expect(createUserSchema.parse(validUser).preferredLocale).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe('es-419');
  });

  it('accepts both supported locales on administrative create', () => {
    expect(createUserSchema.parse({ ...validUser, preferredLocale: 'en-US' }).preferredLocale).toBe('en-US');
    expect(createUserSchema.parse({ ...validUser, preferredLocale: 'es-419' }).preferredLocale).toBe('es-419');
  });

  it('rejects an unsupported locale on administrative create', () => {
    expect(createUserSchema.safeParse({ ...validUser, preferredLocale: 'es-MX' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...validUser, preferredLocale: 'fr-FR' }).success).toBe(false);
  });

  it('keeps the locale optional on administrative update', () => {
    expect(updateUserSchema.safeParse({ name: 'N' }).success).toBe(true);
    expect(updateUserSchema.parse({ preferredLocale: 'en-US' }).preferredLocale).toBe('en-US');
    expect(updateUserSchema.safeParse({ preferredLocale: 'es-MX' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ preferredLocale: null }).success).toBe(false);
  });
});

describe('strict payload validation', () => {
  const uuid = '3f1d9d3a-1c1e-4b1e-9a5e-1b2c3d4e5f60';

  it('rejects unknown fields instead of silently stripping them', () => {
    expect(
      createProductSchema.safeParse({
        sku: 'SKU-1',
        name: 'Product',
        basePrice: 10,
        currencyCode: 'MXN',
        tenantId: uuid
      }).success
    ).toBe(false);

    expect(
      createTenantSchema.safeParse({
        commercialName: 'Acme',
        legalName: 'Acme SA',
        slug: 'acme-co',
        defaultCurrency: 'MXN',
        createdBy: uuid
      }).success
    ).toBe(false);

    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'global_admin' }).success).toBe(false);

    expect(
      createPriceSchema.safeParse({
        productId: uuid,
        priceListId: uuid,
        marketplaceId: uuid,
        basePrice: 10,
        currencyCode: 'MXN',
        startDate: '2024-01-01',
        finalPrice: 5
      }).success
    ).toBe(false);

    expect(setRelationsSchema.safeParse({ ids: [], tenantId: uuid }).success).toBe(false);
    expect(assignPermissionsSchema.safeParse({ permissionSlugs: [], isSystem: true }).success).toBe(false);
  });

  it('still accepts the documented fields', () => {
    expect(
      createProductSchema.safeParse({ sku: 'SKU-1', name: 'Product', basePrice: 10, currencyCode: 'MXN' }).success
    ).toBe(true);
    expect(
      createTenantSchema.safeParse({
        commercialName: 'Acme',
        legalName: 'Acme SA',
        slug: 'acme-co',
        defaultCurrency: 'MXN'
      }).success
    ).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
});

describe('role validators', () => {
  it('accepts allowed slug characters', () => {
    expect(createRoleSchema.safeParse({ name: 'R', slug: 'my-role_1' }).success).toBe(true);
    expect(createRoleSchema.safeParse({ name: 'R', slug: 'Bad Slug' }).success).toBe(false);
  });

  it('accepts optional permission slugs', () => {
    const parsed = createRoleSchema.parse({ name: 'R', slug: 'role', permissionSlugs: ['products:read'] });
    expect(parsed.permissionSlugs).toEqual(['products:read']);
  });

  it('validates permission assignment payloads', () => {
    expect(assignPermissionsSchema.safeParse({ permissionSlugs: [] }).success).toBe(true);
    expect(assignPermissionsSchema.safeParse({ permissionSlugs: ['a'] }).success).toBe(true);
    expect(assignPermissionsSchema.safeParse({}).success).toBe(false);
  });

  it('allows partial role updates', () => {
    expect(updateRoleSchema.safeParse({ description: 'x' }).success).toBe(true);
  });
});

describe('api key validators', () => {
  it('requires at least one scope', () => {
    expect(createApiKeySchema.safeParse({ name: 'K', scopes: ['products:read'] }).success).toBe(true);
    expect(createApiKeySchema.safeParse({ name: 'K', scopes: [] }).success).toBe(false);
  });

  it('coerces an expiry date', () => {
    const parsed = createApiKeySchema.parse({ name: 'K', scopes: ['prices:read'], expiresAt: '2025-01-01' });
    expect(parsed.expiresAt).toBeInstanceOf(Date);
  });

  it('validates partial updates', () => {
    expect(updateApiKeySchema.safeParse({ name: 'New' }).success).toBe(true);
    expect(updateApiKeySchema.safeParse({ scopes: [] }).success).toBe(false);
  });
});

describe('product validators', () => {
  const valid = {
    sku: 'SKU-1',
    name: 'Product',
    basePrice: 10,
    currencyCode: 'mxn'
  };

  it('accepts a valid product and normalizes the currency', () => {
    expect(createProductSchema.parse(valid).currencyCode).toBe('MXN');
  });

  it('rejects a negative base price', () => {
    expect(createProductSchema.safeParse({ ...valid, basePrice: -1 }).success).toBe(false);
  });

  it('coerces numeric strings and allows partial updates', () => {
    expect(createProductSchema.parse({ ...valid, basePrice: '12.5' }).basePrice).toBe(12.5);
    expect(updateProductSchema.safeParse({ name: 'Only name' }).success).toBe(true);
  });
});

describe('marketplace and price list validators', () => {
  it('restricts the marketplace code to the known set', () => {
    expect(createMarketplaceSchema.safeParse({ name: 'Amazon', code: 'amazon' }).success).toBe(true);
    expect(createMarketplaceSchema.safeParse({ name: 'eBay', code: 'ebay' }).success).toBe(false);
  });

  it('accepts nullable or omitted price-list currency', () => {
    expect(createPriceListSchema.safeParse({ name: 'Retail' }).success).toBe(true);
    expect(createPriceListSchema.safeParse({ name: 'Retail', currencyCode: null }).success).toBe(true);
  });

  it('requires uuids for relation payloads', () => {
    expect(setRelationsSchema.safeParse({ ids: [] }).success).toBe(true);
    expect(setRelationsSchema.safeParse({ ids: ['nope'] }).success).toBe(false);
  });
});

describe('price validators', () => {
  const uuid = '3f1d9d3a-1c1e-4b1e-9a5e-1b2c3d4e5f60';
  const valid = {
    productId: uuid,
    priceListId: uuid,
    marketplaceId: uuid,
    basePrice: 100,
    currencyCode: 'MXN',
    startDate: '2024-01-01'
  };

  it('accepts a valid price', () => {
    const parsed = createPriceSchema.parse(valid);
    expect(parsed.startDate).toBeInstanceOf(Date);
  });

  it('rejects an end date before the start date', () => {
    const result = createPriceSchema.safeParse({ ...valid, endDate: '2023-12-01' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('endDate'))).toBe(true);
    }
  });

  it('rejects a negative base price', () => {
    expect(createPriceSchema.safeParse({ ...valid, basePrice: -5 }).success).toBe(false);
  });

  it('validates partial price updates', () => {
    expect(updatePriceSchema.safeParse({ basePrice: 50 }).success).toBe(true);
    expect(updatePriceSchema.safeParse({ basePrice: 50, startDate: '2024-05-01', endDate: '2024-04-01' }).success).toBe(
      false
    );
  });

  it('validates the calculate payload', () => {
    const calculatePayload = {
      productId: uuid,
      priceListId: uuid,
      marketplaceId: uuid,
      basePrice: 100,
      currencyCode: 'MXN'
    };

    expect(calculatePriceSchema.safeParse(calculatePayload).success).toBe(true);
    expect(calculatePriceSchema.safeParse({ ...calculatePayload, productId: 'bad' }).success).toBe(false);
    // A calculated value is server-owned and must not be accepted from a client.
    expect(calculatePriceSchema.safeParse({ ...calculatePayload, finalPrice: 10 }).success).toBe(false);
  });
});

describe('discount validators', () => {
  const uuid = '3f1d9d3a-1c1e-4b1e-9a5e-1b2c3d4e5f60';
  const base = {
    name: 'Summer',
    type: 'percentage',
    value: 10,
    appliesTo: 'product',
    productId: uuid,
    startDate: '2024-01-01'
  };

  it('accepts a product-scoped discount', () => {
    expect(createDiscountSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a percentage above 100', () => {
    const result = createDiscountSchema.safeParse({ ...base, value: 150 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('value'))).toBe(true);
    }
  });

  it('allows a fixed discount above 100', () => {
    expect(createDiscountSchema.safeParse({ ...base, type: 'fixed', value: 150 }).success).toBe(true);
  });

  it('requires the scope FK matching appliesTo', () => {
    const result = createDiscountSchema.safeParse({ ...base, productId: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('productId'))).toBe(true);
    }
  });

  it('rejects extra scope FKs', () => {
    const result = createDiscountSchema.safeParse({ ...base, marketplaceId: uuid });
    expect(result.success).toBe(false);
  });

  it('accepts a price-list scoped discount', () => {
    const result = createDiscountSchema.safeParse({
      name: 'List',
      type: 'fixed',
      value: 5,
      appliesTo: 'price_list',
      priceListId: uuid,
      startDate: '2024-01-01'
    });
    expect(result.success).toBe(true);
  });

  it('accepts a marketplace scoped discount', () => {
    const result = createDiscountSchema.safeParse({
      name: 'Mkt',
      type: 'fixed',
      value: 5,
      appliesTo: 'marketplace',
      marketplaceId: uuid,
      startDate: '2024-01-01'
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid date range', () => {
    expect(createDiscountSchema.safeParse({ ...base, endDate: '2023-01-01' }).success).toBe(false);
  });

  it('validates percentage bounds on update', () => {
    expect(updateDiscountSchema.safeParse({ type: 'percentage', value: 120 }).success).toBe(false);
    expect(updateDiscountSchema.safeParse({ value: 120 }).success).toBe(true);
    expect(updateDiscountSchema.safeParse({ startDate: '2024-05-01', endDate: '2024-04-01' }).success).toBe(false);
  });
});
