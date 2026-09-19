import type { CrudModelOptions } from '../common/crud/types';

/**
 * Declarative CRUD configuration per Prisma model. Keeps repositories thin and
 * makes the tenant/soft-delete/search behaviour explicit.
 */
export const MODEL_OPTIONS: Record<string, CrudModelOptions> = {
  tenant: {
    model: 'tenant',
    tenantScoped: false,
    hasDeletedAt: true,
    searchableFields: ['commercialName', 'legalName', 'slug'],
    filterableFields: ['status', 'defaultCurrency'],
    defaultSortField: 'createdAt',
    include: { currency: true }
  },

  user: {
    model: 'user',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'email'],
    filterableFields: ['status', 'roleId'],
    defaultSortField: 'createdAt',
    include: {
      role: { select: { id: true, slug: true, name: true, isSystem: true } },
      tenant: { select: { id: true, commercialName: true, slug: true } }
    }
  },

  role: {
    model: 'role',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'slug', 'description'],
    filterableFields: ['status', 'isSystem'],
    defaultSortField: 'name',
    defaultSortOrder: 'asc',
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { users: true } }
    }
  },

  product: {
    model: 'product',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['sku', 'name'],
    filterableFields: ['status', 'currencyCode'],
    defaultSortField: 'createdAt',
    include: { currency: true }
  },

  marketplace: {
    model: 'marketplace',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'code'],
    filterableFields: ['status', 'code'],
    defaultSortField: 'createdAt'
  },

  priceList: {
    model: 'priceList',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'description'],
    filterableFields: ['status', 'currencyCode'],
    defaultSortField: 'createdAt',
    include: {
      currency: true,
      priceListProducts: { include: { product: { select: { id: true, sku: true, name: true } } } },
      priceListMarketplaces: { include: { marketplace: { select: { id: true, name: true, code: true } } } }
    }
  },

  price: {
    model: 'price',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['notes'],
    filterableFields: ['status', 'productId', 'priceListId', 'marketplaceId', 'currencyCode'],
    defaultSortField: 'createdAt',
    include: {
      product: { select: { id: true, sku: true, name: true } },
      priceList: { select: { id: true, name: true } },
      marketplace: { select: { id: true, name: true, code: true } },
      currency: true
    }
  },

  priceHistory: {
    model: 'priceHistory',
    tenantScoped: true,
    hasDeletedAt: false,
    hasStatus: false,
    searchableFields: ['reason'],
    filterableFields: ['priceId', 'productId', 'changedByType'],
    defaultSortField: 'createdAt',
    include: { product: { select: { id: true, sku: true, name: true } } }
  },

  discount: {
    model: 'discount',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'description'],
    filterableFields: ['status', 'type', 'appliesTo', 'productId', 'priceListId', 'marketplaceId'],
    defaultSortField: 'createdAt',
    include: {
      product: { select: { id: true, sku: true, name: true } },
      priceList: { select: { id: true, name: true } },
      marketplace: { select: { id: true, name: true, code: true } }
    }
  },

  currency: {
    model: 'currency',
    tenantScoped: false,
    hasDeletedAt: true,
    searchableFields: ['code', 'name'],
    filterableFields: ['status'],
    defaultSortField: 'code',
    defaultSortOrder: 'asc'
  },

  permission: {
    model: 'permission',
    tenantScoped: false,
    hasDeletedAt: true,
    hasStatus: false,
    searchableFields: ['name', 'slug'],
    filterableFields: [],
    defaultSortField: 'slug',
    defaultSortOrder: 'asc'
  },

  apiKey: {
    model: 'apiKey',
    tenantScoped: true,
    hasDeletedAt: true,
    searchableFields: ['name', 'prefix'],
    filterableFields: ['status'],
    defaultSortField: 'createdAt'
  }
};
