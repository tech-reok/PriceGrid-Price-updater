import { runSeeds } from '../../prisma/seed/index';
import { shouldRunDemoSeeds } from '../../prisma/seed/policy';
import { seedCurrencies } from '../../prisma/seed/base/currencies';
import { seedPermissions } from '../../prisma/seed/base/permissions';
import { seedRoles } from '../../prisma/seed/base/roles';
import { seedDemoTenant } from '../../prisma/seed/demo/tenants';
import { seedDemoPrices } from '../../prisma/seed/demo/prices';
import { createDemoApiKey } from '../../prisma/seed/demo/api-key';
import {
  ALL_PERMISSION_SLUGS,
  CURRENCIES,
  DEMO_TENANT,
  PERMISSION_CATALOG,
  READONLY_USER_PERMISSIONS,
  SYSTEM_ROLES,
  TENANT_ADMIN_EXCLUDED,
  TENANT_USER_PERMISSIONS
} from '../../prisma/seed/data';
import { hashApiKey, PHASE_ONE_SCOPES } from '../../src/common/utils/api-key';
import { createFakePrisma } from '../helpers/fake-prisma';

describe('seed policy (demo seed protection)', () => {
  it('allows demo seeds in development', () => {
    expect(shouldRunDemoSeeds({ nodeEnv: 'development', allowDemoSeed: false })).toBe(true);
  });

  it('allows demo seeds with an explicit opt-in', () => {
    expect(shouldRunDemoSeeds({ nodeEnv: 'production', allowDemoSeed: true })).toBe(true);
  });

  it('blocks demo seeds in staging/production by default', () => {
    expect(shouldRunDemoSeeds({ nodeEnv: 'production', allowDemoSeed: false })).toBe(false);
    expect(shouldRunDemoSeeds({ nodeEnv: 'staging', allowDemoSeed: false })).toBe(false);
    expect(shouldRunDemoSeeds({ nodeEnv: 'test', allowDemoSeed: false })).toBe(false);
  });
});

describe('seed catalogs', () => {
  it('defines MXN and USD', () => {
    expect(CURRENCIES.map((currency) => currency.code)).toEqual(['MXN', 'USD']);
    expect(CURRENCIES.every((currency) => currency.decimals === 2)).toBe(true);
  });

  it('builds the full module:action permission catalog', () => {
    expect(PERMISSION_CATALOG).toHaveLength(46);
    expect(ALL_PERMISSION_SLUGS).toContain('products:read');
    expect(ALL_PERMISSION_SLUGS).toContain('prices:calculate');
    expect(ALL_PERMISSION_SLUGS).toContain('api-keys:revoke');
    expect(ALL_PERMISSION_SLUGS).toContain('roles:assign-permissions');
    expect(ALL_PERMISSION_SLUGS).toContain('tenants:switch');
    expect(ALL_PERMISSION_SLUGS).toContain('currencies:read');
  });

  it('defines the four system roles', () => {
    expect(SYSTEM_ROLES.map((role) => role.slug)).toEqual([
      'global_admin',
      'tenant_admin',
      'tenant_user',
      'readonly_user'
    ]);
  });

  it('gives the global admin every permission', () => {
    const globalAdmin = SYSTEM_ROLES.find((role) => role.slug === 'global_admin')!;
    expect(globalAdmin.permissions).toHaveLength(ALL_PERMISSION_SLUGS.length);
  });

  it('removes global company management from the tenant admin', () => {
    const tenantAdmin = SYSTEM_ROLES.find((role) => role.slug === 'tenant_admin')!;
    for (const excluded of TENANT_ADMIN_EXCLUDED) {
      expect(tenantAdmin.permissions).not.toContain(excluded);
    }
    expect(tenantAdmin.permissions).toContain('tenants:read');
    expect(tenantAdmin.permissions).toContain('users:create');
  });

  it('gives the operator and read-only roles their documented scopes', () => {
    const operator = SYSTEM_ROLES.find((role) => role.slug === 'tenant_user')!;
    expect(operator.permissions).toEqual(TENANT_USER_PERMISSIONS);
    expect(operator.permissions).not.toContain('users:create');

    const readonly = SYSTEM_ROLES.find((role) => role.slug === 'readonly_user')!;
    expect(readonly.permissions).toEqual(READONLY_USER_PERMISSIONS);
    expect(readonly.permissions.every((slug) => slug.endsWith(':read'))).toBe(true);
  });
});

describe('base seeds', () => {
  it('inserts currencies idempotently', async () => {
    const prisma = createFakePrisma();

    await seedCurrencies(prisma);
    await seedCurrencies(prisma);

    expect(prisma.__store.currency).toHaveLength(2);
    expect(prisma.__store.currency.map((row: any) => row.code).sort()).toEqual(['MXN', 'USD']);
  });

  it('inserts permissions idempotently', async () => {
    const prisma = createFakePrisma();

    await seedPermissions(prisma);
    await seedPermissions(prisma);

    expect(prisma.__store.permission).toHaveLength(PERMISSION_CATALOG.length);
  });

  it('inserts system roles with permissions idempotently', async () => {
    const prisma = createFakePrisma();

    await seedPermissions(prisma);
    const first = await seedRoles(prisma);
    const second = await seedRoles(prisma);

    expect(prisma.__store.role).toHaveLength(4);
    expect(Object.keys(first).sort()).toEqual(['global_admin', 'readonly_user', 'tenant_admin', 'tenant_user']);
    expect(first.global_admin).toBe(second.global_admin);

    // No duplicated role_permission rows on the second run.
    const globalAdminLinks = prisma.__store.rolePermission.filter(
      (row: any) => row.roleId === first.global_admin
    );
    expect(globalAdminLinks).toHaveLength(ALL_PERMISSION_SLUGS.length);
  });

  it('marks system roles as is_system with a null tenant', async () => {
    const prisma = createFakePrisma();
    await seedPermissions(prisma);
    await seedRoles(prisma);

    expect(prisma.__store.role.every((row: any) => row.isSystem === true && row.tenantId === null)).toBe(true);
  });

  it('creates the demo company idempotently', async () => {
    const prisma = createFakePrisma({ currency: [{ code: 'MXN', name: 'Peso' }] });

    await seedDemoTenant(prisma);
    await seedDemoTenant(prisma);

    expect(prisma.__store.tenant).toHaveLength(1);
    expect(prisma.__store.tenant[0]).toMatchObject({
      slug: DEMO_TENANT.slug,
      commercialName: 'Demo Company',
      legalName: 'Demo Company S.A. de C.V.',
      defaultCurrency: 'MXN'
    });
  });
});

describe('runSeeds orchestrator', () => {
  it('runs only base seeds when demo is disabled', async () => {
    const prisma = createFakePrisma();
    const summary = await runSeeds(prisma, { allowDemo: false });

    expect(summary.demoSeeded).toBe(false);
    expect(summary.demo).toBeUndefined();
    expect(summary.currencies).toBe(2);
    expect(summary.permissions).toBe(PERMISSION_CATALOG.length);
    expect(summary.roles).toHaveLength(4);

    expect(prisma.__store.tenant ?? []).toHaveLength(0);
    expect(prisma.__store.user ?? []).toHaveLength(0);
    expect(prisma.__store.product ?? []).toHaveLength(0);
  });

  it('creates the full demo dataset when enabled', async () => {
    const prisma = createFakePrisma();
    const summary = await runSeeds(prisma, { allowDemo: true });

    expect(summary.demoSeeded).toBe(true);
    expect(summary.demo).toMatchObject({
      marketplaces: 3,
      priceLists: 3,
      products: 3,
      productLinks: 9,
      marketplaceLinks: 9,
      discount: 'Descuento demo 10%'
    });
    // 3 products x 3 lists x 3 marketplaces
    expect(summary.demo?.prices).toBe(27);

    expect(prisma.__store.user).toHaveLength(2);
    expect(prisma.__store.priceHistory).toHaveLength(27);
  });

  it('creates a global admin with no tenant and a company admin bound to the demo company', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    const users = prisma.__store.user;
    const globalAdmin = users.find((row: any) => row.tenantId === null);
    const tenantAdmin = users.find((row: any) => row.tenantId !== null);

    expect(globalAdmin).toBeTruthy();
    expect(tenantAdmin.tenantId).toBe(prisma.__store.tenant[0].id);
  });

  it('hashes the seeded passwords', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    for (const user of prisma.__store.user) {
      expect(user.passwordHash).toBeTruthy();
      expect(user.passwordHash).not.toContain('ChangeMe');
      expect(user.passwordHash.length).toBeGreaterThan(20);
    }
  });

  it('writes price history with the system actor and reason=create', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    for (const row of prisma.__store.priceHistory) {
      expect(row.reason).toBe('create');
      expect(row.changedByType).toBe('system');
      expect(row.changedById).toBeNull();
    }
  });

  it('is idempotent: running twice does not duplicate data', async () => {
    const prisma = createFakePrisma();

    await runSeeds(prisma, { allowDemo: true });
    const afterFirst = {
      currencies: prisma.__store.currency.length,
      permissions: prisma.__store.permission.length,
      roles: prisma.__store.role.length,
      tenants: prisma.__store.tenant.length,
      users: prisma.__store.user.length,
      marketplaces: prisma.__store.marketplace.length,
      priceLists: prisma.__store.priceList.length,
      products: prisma.__store.product.length,
      prices: prisma.__store.price.length,
      history: prisma.__store.priceHistory.length,
      discounts: prisma.__store.discount.length,
      links: prisma.__store.priceListProduct.length + prisma.__store.priceListMarketplace.length
    };

    await runSeeds(prisma, { allowDemo: true });

    expect({
      currencies: prisma.__store.currency.length,
      permissions: prisma.__store.permission.length,
      roles: prisma.__store.role.length,
      tenants: prisma.__store.tenant.length,
      users: prisma.__store.user.length,
      marketplaces: prisma.__store.marketplace.length,
      priceLists: prisma.__store.priceList.length,
      products: prisma.__store.product.length,
      prices: prisma.__store.price.length,
      history: prisma.__store.priceHistory.length,
      discounts: prisma.__store.discount.length,
      links: prisma.__store.priceListProduct.length + prisma.__store.priceListMarketplace.length
    }).toEqual(afterFirst);
  });

  it('reflects the demo discount in the seeded final prices', async () => {
    const prisma = createFakePrisma();
    await runSeeds(prisma, { allowDemo: true });

    const discounted = prisma.__store.price.filter((row: any) => Number(row.basePrice) === 100);
    expect(discounted.length).toBeGreaterThan(0);
    expect(discounted.every((row: any) => Number(row.finalPrice) === 90)).toBe(true);
  });
});

describe('demo price seeding details', () => {
  it('skips prices that already exist', async () => {
    const prisma = createFakePrisma({
      discount: [],
      price: [
        {
          id: 'existing',
          tenantId: 't1',
          productId: 'p1',
          priceListId: 'l1',
          marketplaceId: 'm1',
          basePrice: 10,
          finalPrice: 10
        }
      ]
    });

    const created = await seedDemoPrices(prisma, {
      tenantId: 't1',
      products: [{ id: 'p1', basePrice: 10 }],
      priceLists: [{ id: 'l1' }],
      marketplaces: [{ id: 'm1' }]
    });

    expect(created).toHaveLength(1);
    expect(prisma.__store.price).toHaveLength(1);
    expect(prisma.__store.priceHistory ?? []).toHaveLength(0);
  });
});

describe('demo API key command', () => {
  it('returns null when the demo company is missing', async () => {
    const prisma = createFakePrisma();
    await expect(createDemoApiKey(prisma)).resolves.toBeNull();
  });

  it('stores only the hash and returns the plaintext once', async () => {
    const prisma = createFakePrisma({
      tenant: [{ id: 't1', slug: 'demo-company', commercialName: 'Demo', deletedAt: null }]
    });

    const result = await createDemoApiKey(prisma);
    expect(result).not.toBeNull();

    const stored = prisma.__store.apiKey[0];
    expect(stored.keyHash).toBe(hashApiKey(result!.plaintextKey));
    expect(stored.keyHash).not.toBe(result!.plaintextKey);
    expect(stored.scopes).toEqual([...PHASE_ONE_SCOPES]);
    expect(stored.status).toBe('active');
  });
});
