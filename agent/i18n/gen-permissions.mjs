// Generates the permission and system-role catalog entries.
//
// The permission catalog is derived from the same module/action tables the API
// seeds use (prisma/seed/data.ts), so the UI copy cannot drift from the backend
// contract. Names and descriptions are translated per slug, as required by the
// plan; the raw slug remains the stable identifier shown in the UI.
//
// Usage: node agent/i18n/gen-permissions.mjs
// Writes agent/i18n/p4-permissions.es.json and .en.json

import { writeFileSync } from 'node:fs';

/** module -> actions, mirroring PERMISSION_MODULES in the backend seed. */
const PERMISSION_MODULES = {
  tenants: ['read', 'create', 'update', 'delete', 'switch'],
  users: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'create', 'update', 'delete', 'assign-permissions'],
  permissions: ['read'],
  products: ['read', 'create', 'update', 'delete'],
  marketplaces: ['read', 'create', 'update', 'delete'],
  'price-lists': ['read', 'create', 'update', 'delete'],
  prices: ['read', 'create', 'update', 'delete', 'calculate'],
  discounts: ['read', 'create', 'update', 'delete'],
  'price-catalog': ['read', 'read-all', 'export'],
  'price-list-access': ['read', 'manage'],
  'price-history': ['read'],
  'api-keys': ['read', 'create', 'update', 'delete', 'revoke'],
  currencies: ['read'],
  dashboard: ['read'],
  settings: ['read', 'update']
};

const MODULE_LABEL = {
  'es-419': {
    tenants: 'empresas',
    users: 'usuarios',
    roles: 'roles',
    permissions: 'permisos',
    products: 'productos',
    marketplaces: 'marketplaces',
    'price-lists': 'listas de precios',
    prices: 'precios',
    discounts: 'descuentos',
    'price-catalog': 'catálogo de precios',
    'price-list-access': 'acceso a listas de precios',
    'price-history': 'historial de precios',
    'api-keys': 'API keys',
    currencies: 'monedas',
    dashboard: 'panel',
    settings: 'configuración'
  },
  'en-US': {
    tenants: 'companies',
    users: 'users',
    roles: 'roles',
    permissions: 'permissions',
    products: 'products',
    marketplaces: 'marketplaces',
    'price-lists': 'price lists',
    prices: 'prices',
    discounts: 'discounts',
    'price-catalog': 'price catalog',
    'price-list-access': 'price-list access',
    'price-history': 'price history',
    'api-keys': 'API keys',
    currencies: 'currencies',
    dashboard: 'dashboard',
    settings: 'settings'
  }
};

const ACTION = {
  read: { es: 'Ver', en: 'View', esGerund: 'ver', enGerund: 'viewing' },
  create: { es: 'Crear', en: 'Create', esGerund: 'crear', enGerund: 'creating' },
  update: { es: 'Editar', en: 'Update', esGerund: 'editar', enGerund: 'updating' },
  delete: { es: 'Eliminar', en: 'Delete', esGerund: 'eliminar', enGerund: 'deleting' },
  calculate: { es: 'Calcular', en: 'Calculate', esGerund: 'calcular', enGerund: 'calculating' },
  revoke: { es: 'Revocar', en: 'Revoke', esGerund: 'revocar', enGerund: 'revoking' },
  manage: { es: 'Gestionar', en: 'Manage', esGerund: 'gestionar', enGerund: 'managing' },
  export: { es: 'Exportar', en: 'Export', esGerund: 'exportar', enGerund: 'exporting' }
};

/** Actions whose verb already names the object, so no module is appended. */
const OBJECTLESS = {
  switch: {
    'es-419': { name: 'Cambiar de empresa', description: 'Permite cambiar de empresa' },
    'en-US': { name: 'Switch company', description: 'Allows switching company' }
  },
  'assign-permissions': {
    'es-419': { name: 'Asignar permisos', description: 'Permite asignar permisos a un rol' },
    'en-US': { name: 'Assign permissions', description: 'Allows assigning permissions to a role' }
  },
  'read-all': {
    'es-419': { name: 'Ver todo {{module}}', description: 'Permite ver todo {{module}}' },
    'en-US': { name: 'View all {{module}}', description: 'Allows viewing all {{module}}' }
  }
};

function permissionEntries(locale) {
  const entries = {};

  for (const [module, actions] of Object.entries(PERMISSION_MODULES)) {
    const moduleLabel = MODULE_LABEL[locale][module];

    for (const action of actions) {
      const slug = `${module}:${action}`;
      const special = OBJECTLESS[action];

      if (special) {
        entries[slug] = {
          name: special[locale].name.replace('{{module}}', moduleLabel),
          description: special[locale].description.replace('{{module}}', moduleLabel)
        };
        continue;
      }

      const verb = ACTION[action];
      entries[slug] =
        locale === 'es-419'
          ? {
              name: `${verb.es} ${moduleLabel}`,
              description: `Permite ${verb.esGerund} ${moduleLabel}`
            }
          : {
              name: `${verb.en} ${moduleLabel}`,
              description: `Allows ${verb.enGerund} ${moduleLabel}`
            };
    }
  }

  return entries;
}

/** System roles, translated by slug. Custom roles keep their database copy. */
const SYSTEM_ROLES = {
  'es-419': {
    global_admin: {
      name: 'Administrador global',
      description: 'Acceso completo a todas las empresas'
    },
    tenant_admin: {
      name: 'Administrador de empresa',
      description: 'Acceso completo dentro de la empresa, sin la gestión global de empresas'
    },
    tenant_user: {
      name: 'Operador de empresa',
      description: 'Acceso operativo de lectura y escritura en los módulos principales'
    },
    readonly_user: {
      name: 'Usuario de sólo lectura',
      description: 'Acceso de sólo lectura al catálogo de precios'
    },
    price_catalog_viewer: {
      name: 'Consulta de catálogo de precios',
      description: 'Sólo lectura y exportación de las listas asignadas'
    }
  },
  'en-US': {
    global_admin: {
      name: 'Global administrator',
      description: 'Full access across every company'
    },
    tenant_admin: {
      name: 'Company administrator',
      description: 'Full access inside the company, excluding global company management'
    },
    tenant_user: {
      name: 'Company operator',
      description: 'Operational read/write access on the main catalog modules'
    },
    readonly_user: {
      name: 'Read-only user',
      description: 'Read-only access to the price catalog'
    },
    price_catalog_viewer: {
      name: 'Price catalog viewer',
      description: 'Read and export assigned price lists only'
    }
  }
};

for (const locale of ['es-419', 'en-US']) {
  const fragment = {
    permissions: permissionEntries(locale),
    roles: { systemRoles: SYSTEM_ROLES[locale] }
  };

  const file = `agent/i18n/p4-permissions.${locale}.json`;
  writeFileSync(file, `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');

  const count = Object.keys(fragment.permissions).length;
  console.log(`${locale}: ${count} permissions, ${Object.keys(SYSTEM_ROLES[locale]).length} system roles -> ${file}`);
}
