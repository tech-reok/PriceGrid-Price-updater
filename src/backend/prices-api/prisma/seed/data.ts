/**
 * Canonical seed catalogs. Kept declarative so both the seeds and their unit
 * tests share a single source of truth.
 */

export interface CurrencySeed {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: CurrencySeed[] = [
  { code: 'MXN', name: 'Peso mexicano', symbol: '$', decimals: 2 },
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimals: 2 }
];

/** module -> actions, following the `module:action` permission convention. */
export const PERMISSION_MODULES: Record<string, string[]> = {
  tenants: ['read', 'create', 'update', 'delete', 'switch'],
  users: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'create', 'update', 'delete', 'assign-permissions'],
  permissions: ['read'],
  products: ['read', 'create', 'update', 'delete'],
  marketplaces: ['read', 'create', 'update', 'delete'],
  'price-lists': ['read', 'create', 'update', 'delete'],
  prices: ['read', 'create', 'update', 'delete', 'calculate'],
  discounts: ['read', 'create', 'update', 'delete'],
  'price-history': ['read'],
  'api-keys': ['read', 'create', 'update', 'delete', 'revoke'],
  currencies: ['read'],
  dashboard: ['read'],
  settings: ['read', 'update']
};

const PRETTY_MODULE: Record<string, string> = {
  tenants: 'companies',
  users: 'users',
  roles: 'roles',
  permissions: 'permissions',
  products: 'products',
  marketplaces: 'marketplaces',
  'price-lists': 'price lists',
  prices: 'prices',
  discounts: 'discounts',
  'price-history': 'price history',
  'api-keys': 'API keys',
  currencies: 'currencies',
  dashboard: 'dashboard',
  settings: 'settings'
};

const PRETTY_ACTION: Record<string, string> = {
  read: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  switch: 'Switch company',
  'assign-permissions': 'Assign permissions',
  calculate: 'Calculate',
  revoke: 'Revoke'
};

export interface PermissionSeed {
  slug: string;
  name: string;
  description: string;
}

export function buildPermissionCatalog(): PermissionSeed[] {
  const catalog: PermissionSeed[] = [];
  for (const [module, actions] of Object.entries(PERMISSION_MODULES)) {
    for (const action of actions) {
      catalog.push({
        slug: `${module}:${action}`,
        name: `${PRETTY_ACTION[action] ?? action} ${PRETTY_MODULE[module] ?? module}`,
        description: `Allows ${action} on ${PRETTY_MODULE[module] ?? module}`
      });
    }
  }
  return catalog;
}

export const PERMISSION_CATALOG: PermissionSeed[] = buildPermissionCatalog();

export const ALL_PERMISSION_SLUGS: string[] = PERMISSION_CATALOG.map((p) => p.slug);

export const TENANT_ADMIN_EXCLUDED = [
  'tenants:create',
  'tenants:update',
  'tenants:delete',
  'tenants:switch'
];

export const TENANT_USER_PERMISSIONS = [
  'products:read',
  'products:create',
  'products:update',
  'price-lists:read',
  'price-lists:create',
  'price-lists:update',
  'prices:read',
  'prices:create',
  'prices:update',
  'prices:calculate',
  'discounts:read',
  'discounts:create',
  'discounts:update',
  'marketplaces:read',
  'price-history:read',
  'currencies:read',
  'dashboard:read'
];

export const READONLY_USER_PERMISSIONS = [
  'products:read',
  'marketplaces:read',
  'price-lists:read',
  'prices:read',
  'discounts:read',
  'price-history:read',
  'currencies:read',
  'dashboard:read'
];

export interface RoleSeed {
  slug: string;
  name: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_ROLES: RoleSeed[] = [
  {
    slug: 'global_admin',
    name: 'Global administrator',
    description: 'Full access across every company',
    permissions: ALL_PERMISSION_SLUGS
  },
  {
    slug: 'tenant_admin',
    name: 'Company administrator',
    description: 'Full access inside the company, excluding global company management',
    permissions: ALL_PERMISSION_SLUGS.filter((slug) => !TENANT_ADMIN_EXCLUDED.includes(slug))
  },
  {
    slug: 'tenant_user',
    name: 'Company operator',
    description: 'Operational read/write access on the main catalog modules',
    permissions: TENANT_USER_PERMISSIONS
  },
  {
    slug: 'readonly_user',
    name: 'Read-only user',
    description: 'Read-only access to the price catalog',
    permissions: READONLY_USER_PERMISSIONS
  }
];

export const DEMO_TENANT = {
  commercialName: 'Demo Company',
  legalName: 'Demo Company S.A. de C.V.',
  slug: 'demo-company',
  defaultCurrency: 'MXN',
  notes: 'Empresa inicial para desarrollo y pruebas'
};

export const DEMO_MARKETPLACES = [
  { name: 'Amazon', code: 'amazon' as const },
  { name: 'Mercado Libre', code: 'mercadolibre' as const },
  { name: 'Tienda propia', code: 'own_store' as const }
];

export const DEMO_PRICE_LISTS = [
  { name: 'Retail', description: 'Lista de precios minorista' },
  { name: 'Wholesale', description: 'Lista de precios mayorista' },
  { name: 'Marketplace', description: 'Lista de precios para marketplaces' }
];

export const DEMO_PRODUCTS = [
  { sku: 'SKU-DEMO-001', name: 'Producto Demo 1', basePrice: 100, description: 'Producto de ejemplo para desarrollo' },
  { sku: 'SKU-DEMO-002', name: 'Producto Demo 2', basePrice: 250, description: 'Producto de ejemplo para desarrollo' },
  { sku: 'SKU-DEMO-003', name: 'Producto Demo 3', basePrice: 500, description: 'Producto de ejemplo para desarrollo' }
];

export const DEMO_DISCOUNT = {
  name: 'Descuento demo 10%',
  type: 'percentage' as const,
  value: 10,
  priority: 10,
  description: 'Descuento de ejemplo creado por los seeds de desarrollo'
};
