import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;

export const FAKE_MODELS = [
  'currency',
  'permission',
  'tenant',
  'role',
  'rolePermission',
  'user',
  'refreshToken',
  'apiKey',
  'product',
  'marketplace',
  'priceList',
  'priceListProduct',
  'priceListMarketplace',
  'price',
  'priceHistory',
  'discount',
  'userPriceListAccess',
  'exportRequest'
];

function valueOf(row: Row, path: string): any {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), row);
}

/** Supports the Prisma filter operators used across the codebase. */
function matchCondition(value: any, condition: any): boolean {
  if (condition === null || condition === undefined) {
    return value === null || value === undefined;
  }
  if (condition instanceof Date) {
    return value instanceof Date && value.getTime() === condition.getTime();
  }
  if (typeof condition !== 'object' || Array.isArray(condition)) {
    return value === condition;
  }

  const entries = Object.entries(condition);
  if (entries.length === 0) return true;

  return entries.every(([operator, operand]) => {
    switch (operator) {
      case 'equals':
        return matchCondition(value, operand);
      case 'not':
        return !matchCondition(value, operand);
      case 'in':
        return Array.isArray(operand) && operand.some((item) => matchCondition(value, item));
      case 'notIn':
        return Array.isArray(operand) && !operand.some((item) => matchCondition(value, item));
      case 'contains':
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes(String(operand).toLowerCase())
        );
      case 'startsWith':
        return typeof value === 'string' && value.startsWith(String(operand));
      case 'endsWith':
        return typeof value === 'string' && value.endsWith(String(operand));
      case 'gte':
        return value !== null && value !== undefined && value >= (operand as any);
      case 'lte':
        return value !== null && value !== undefined && value <= (operand as any);
      case 'gt':
        return value !== null && value !== undefined && value > (operand as any);
      case 'lt':
        return value !== null && value !== undefined && value < (operand as any);
      default:
        // Relation filters are not simulated.
        return true;
    }
  });
}

export function matchWhere(row: Row, where: any): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      return clauses.every((clause) => matchWhere(row, clause));
    }
    if (key === 'OR') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      return clauses.some((clause) => matchWhere(row, clause));
    }
    if (key === 'NOT') {
      const clauses = Array.isArray(condition) ? condition : [condition];
      return !clauses.some((clause) => matchWhere(row, clause));
    }
    return matchCondition(valueOf(row, key), condition);
  });
}

function sortRows(rows: Row[], orderBy?: any): Row[] {
  if (!orderBy) return rows;
  const entries = Object.entries(orderBy) as [string, 'asc' | 'desc'][];
  if (entries.length === 0) return rows;

  const [field, direction] = entries[0];
  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];

    let comparison = 0;
    if (left instanceof Date && right instanceof Date) {
      comparison = left.getTime() - right.getTime();
    } else if (left === right) {
      comparison = 0;
    } else if (left === null || left === undefined) {
      comparison = -1;
    } else if (right === null || right === undefined) {
      comparison = 1;
    } else {
      comparison = left < right ? -1 : 1;
    }

    return direction === 'desc' ? -comparison : comparison;
  });
}

/** belongsTo relation map used to resolve simple `include` clauses. */
const BELONGS_TO: Record<string, Record<string, [string, string, string]>> = {
  rolePermission: {
    permission: ['permission', 'permissionId', 'id'],
    role: ['role', 'roleId', 'id']
  },
  user: {
    role: ['role', 'roleId', 'id'],
    tenant: ['tenant', 'tenantId', 'id']
  },
  apiKey: { tenant: ['tenant', 'tenantId', 'id'] },
  product: { currency: ['currency', 'currencyCode', 'code'] },
  priceList: { currency: ['currency', 'currencyCode', 'code'] },
  price: {
    product: ['product', 'productId', 'id'],
    priceList: ['priceList', 'priceListId', 'id'],
    marketplace: ['marketplace', 'marketplaceId', 'id'],
    currency: ['currency', 'currencyCode', 'code']
  },
  priceHistory: {
    product: ['product', 'productId', 'id'],
    price: ['price', 'priceId', 'id']
  },
  discount: {
    product: ['product', 'productId', 'id'],
    priceList: ['priceList', 'priceListId', 'id'],
    marketplace: ['marketplace', 'marketplaceId', 'id']
  },
  priceListProduct: {
    product: ['product', 'productId', 'id'],
    priceList: ['priceList', 'priceListId', 'id']
  },
  priceListMarketplace: {
    marketplace: ['marketplace', 'marketplaceId', 'id'],
    priceList: ['priceList', 'priceListId', 'id']
  },
  userPriceListAccess: {
    priceList: ['priceList', 'priceListId', 'id'],
    user: ['user', 'userId', 'id']
  },
  exportRequest: {
    priceList: ['priceList', 'priceListId', 'id'],
    marketplace: ['marketplace', 'marketplaceId', 'id'],
    requestedByUser: ['user', 'requestedByUserId', 'id']
  },
  tenant: { currency: ['currency', 'defaultCurrency', 'code'] }
};

/**
 * In-memory Prisma double. Implements the subset of the client used by the
 * repositories, services and seeds so unit tests stay fast and DB-free.
 */
export function createFakePrisma(initial: Record<string, Row[]> = {}): any {
  const store: Record<string, Row[]> = {};

  const ensure = (model: string): Row[] => {
    if (!store[model]) store[model] = [];
    return store[model];
  };

  for (const [model, rows] of Object.entries(initial)) {
    store[model] = rows.map((row) => ({ ...row }));
  }

  const clone = (row: Row): Row => ({ ...row });

  /** Resolves simple belongsTo relations declared through `include`. */
  const decorate = (model: string, row: Row | null, include?: any): any => {
    if (!row) return row;
    const result = clone(row);
    if (!include) return result;

    for (const relation of Object.keys(include)) {
      const mapping = BELONGS_TO[model]?.[relation];
      if (!mapping) continue;
      const [relatedModel, localKey, relatedKey] = mapping;
      const related = ensure(relatedModel).find((candidate) => candidate[relatedKey] === row[localKey]);
      result[relation] = related ? clone(related) : null;
    }

    return result;
  };

  function makeDelegate(model: string): any {
    const rows = (): Row[] => ensure(model);
    const delegate: any = {};

    delegate.findFirst = async ({ where, orderBy, include }: any = {}) => {
      let found = rows().filter((row) => matchWhere(row, where));
      if (orderBy) found = sortRows(found, orderBy);
      return found.length > 0 ? decorate(model, found[0], include) : null;
    };

    delegate.findUnique = async ({ where, include }: any = {}) => delegate.findFirst({ where, include });

    delegate.findMany = async ({ where, orderBy, skip, take, include }: any = {}) => {
      let found = rows().filter((row) => matchWhere(row, where));
      if (orderBy) found = sortRows(found, orderBy);
      if (typeof skip === 'number') found = found.slice(skip);
      if (typeof take === 'number') found = found.slice(0, take);
      return found.map((row) => decorate(model, row, include));
    };

    delegate.create = async ({ data, include }: any = {}) => {
      const row: Row = {
        id: data?.id ?? randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      };
      rows().push(row);
      return decorate(model, row, include);
    };

    delegate.createMany = async ({ data }: any = {}) => {
      const list = Array.isArray(data) ? data : [data];
      for (const item of list) {
        rows().push({ id: item.id ?? randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...item });
      }
      return { count: list.length };
    };

    delegate.update = async ({ where, data, include }: any = {}) => {
      const row = rows().find((candidate) => matchWhere(candidate, where));
      if (!row) throw new Error(`${model} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return decorate(model, row, include);
    };

    delegate.updateMany = async ({ where, data }: any = {}) => {
      const found = rows().filter((row) => matchWhere(row, where));
      found.forEach((row) => {
        for (const [field, value] of Object.entries(data ?? {})) {
          if (value && typeof value === 'object' && 'increment' in value) {
            row[field] = Number(row[field] ?? 0) + Number((value as any).increment);
          } else {
            row[field] = value;
          }
        }
      });
      return { count: found.length };
    };

    delegate.upsert = async ({ where, create, update }: any = {}) => {
      const row = rows().find((candidate) => matchWhere(candidate, where));
      if (row) {
        Object.assign(row, update, { updatedAt: new Date() });
        return clone(row);
      }
      return delegate.create({ data: create });
    };

    delegate.deleteMany = async ({ where }: any = {}) => {
      const keep = rows().filter((row) => !matchWhere(row, where));
      const removed = rows().length - keep.length;
      store[model] = keep;
      return { count: removed };
    };

    delegate.delete = async ({ where }: any = {}) => {
      const index = rows().findIndex((row) => matchWhere(row, where));
      if (index < 0) throw new Error(`${model} not found`);
      const [removed] = store[model].splice(index, 1);
      return clone(removed);
    };

    delegate.count = async ({ where }: any = {}) => rows().filter((row) => matchWhere(row, where)).length;

    delegate.groupBy = async ({ by, where, _count, _avg }: any = {}) => {
      const found = rows().filter((row) => matchWhere(row, where));
      const groups = new Map<string, Row[]>();

      for (const row of found) {
        const key = by.map((field: string) => String(row[field])).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      return [...groups.values()].map((groupRows) => {
        const result: Row = {};
        for (const field of by) result[field] = groupRows[0][field];
        if (_count) result._count = { _all: groupRows.length };
        if (_avg) {
          result._avg = {};
          for (const field of Object.keys(_avg)) {
            const values = groupRows
              .map((row) => Number(row[field]))
              .filter((value) => !Number.isNaN(value));
            result._avg[field] = values.length
              ? values.reduce((total, value) => total + value, 0) / values.length
              : null;
          }
        }
        return result;
      });
    };

    return delegate;
  }

  const prisma: any = {};
  for (const model of FAKE_MODELS) prisma[model] = makeDelegate(model);

  prisma.$transaction = async (input: any) =>
    typeof input === 'function' ? input(prisma) : Promise.all(input);
  prisma.$queryRaw = async () => [{ '1': 1 }];
  prisma.$disconnect = async () => undefined;
  prisma.__store = store;

  return prisma;
}
