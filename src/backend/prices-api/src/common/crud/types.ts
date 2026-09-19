import type { RequestHandler } from 'express';

/** Declarative description of a tenant-scoped CRUD resource. */
export interface CrudModelOptions {
  /** Prisma delegate key (e.g. `product`). */
  model: string;
  /** When true every query is filtered by the resolved tenant. */
  tenantScoped: boolean;
  /** When true listings exclude rows with `deletedAt != null`. */
  hasDeletedAt: boolean;
  /** When false the model has no `status` column (defaults to true). */
  hasStatus?: boolean;
  /** Text columns used by the `search` query parameter. */
  searchableFields: string[];
  /** Exact-match columns accepted from the query string. */
  filterableFields: string[];
  /** Sort column used when the request does not provide one. */
  defaultSortField: string;
  defaultSortOrder?: 'asc' | 'desc';
  /** Prisma `include` applied to reads. */
  include?: Record<string, unknown>;
  /** Columns allowed as `sort` values (defaults to a safe built-in set). */
  sortableFields?: string[];
}

export interface CrudController {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

export interface CrudRouterOptions {
  controller: CrudController;
  /** Auth + tenant middlewares applied to every route. */
  guards: RequestHandler[];
  /** Permission required per HTTP verb (checked after the guards). */
  permissions?: {
    read?: string;
    create?: string;
    update?: string;
    delete?: string;
  };
  createValidators?: RequestHandler[];
  updateValidators?: RequestHandler[];
}

export interface ReadOnlyRouterOptions {
  controller: CrudController;
  guards: RequestHandler[];
  readPermission?: string;
}

export const SAFE_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'code', 'sku', 'status'] as const;
