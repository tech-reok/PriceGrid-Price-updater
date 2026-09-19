import { TenantCrudRepository } from '../../src/common/crud/repository';
import { CrudService } from '../../src/common/crud/service';
import { createCrudController, requireActor, requireTenant } from '../../src/common/crud/controller';
import { createCrudRouter, createReadOnlyRouter } from '../../src/common/crud/router';
import { NotFoundError, UnauthorizedError } from '../../src/common/errors';
import type { CrudModelOptions } from '../../src/common/crud/types';
import { createFakePrisma } from '../helpers/fake-prisma';
import { mockRequest, mockResponse, runHandler } from '../helpers/http';

const OPTIONS: CrudModelOptions = {
  model: 'product',
  tenantScoped: true,
  hasDeletedAt: true,
  searchableFields: ['sku', 'name'],
  filterableFields: ['status', 'currencyCode'],
  defaultSortField: 'createdAt'
};

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function buildRepository() {
  const prisma = createFakePrisma({
    product: [
      {
        id: 'p1',
        tenantId: TENANT_A,
        sku: 'SKU-1',
        name: 'Cafetera',
        basePrice: 100,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null,
        createdAt: new Date('2024-01-01')
      },
      {
        id: 'p2',
        tenantId: TENANT_A,
        sku: 'SKU-2',
        name: 'Tostadora',
        basePrice: 200,
        currencyCode: 'USD',
        status: 'inactive',
        deletedAt: null,
        createdAt: new Date('2024-02-01')
      },
      {
        id: 'p3',
        tenantId: TENANT_A,
        sku: 'SKU-3',
        name: 'Borrada',
        basePrice: 300,
        currencyCode: 'MXN',
        status: 'inactive',
        deletedAt: new Date('2024-03-01'),
        createdAt: new Date('2024-03-01')
      },
      {
        id: 'p9',
        tenantId: TENANT_B,
        sku: 'SKU-9',
        name: 'Otro tenant',
        basePrice: 900,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null,
        createdAt: new Date('2024-04-01')
      }
    ]
  });

  return { prisma, repository: new TenantCrudRepository(prisma, OPTIONS) };
}

const listQuery = (overrides: Record<string, unknown> = {}) => ({
  page: 1,
  limit: 20,
  order: 'desc' as const,
  ...overrides
});

describe('TenantCrudRepository — multi-tenant isolation', () => {
  it('only lists rows of the resolved tenant', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery());

    expect(result.data.map((row: any) => row.id).sort()).toEqual(['p1', 'p2']);
    expect(result.meta.total).toBe(2);
  });

  it('excludes soft-deleted rows', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery());

    expect(result.data.some((row: any) => row.id === 'p3')).toBe(false);
  });

  it('returns null when reading another tenant record', async () => {
    const { repository } = buildRepository();
    await expect(repository.findById(TENANT_A, 'p9')).resolves.toBeNull();
    await expect(repository.findById(TENANT_B, 'p9')).resolves.toBeTruthy();
  });

  it('refuses to update a record from another tenant', async () => {
    const { repository } = buildRepository();
    const actor = { id: 'u1', type: 'user' as const };

    await expect(repository.update(TENANT_A, 'p9', { name: 'hack' }, actor)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('refuses to delete a record from another tenant', async () => {
    const { repository } = buildRepository();
    await expect(
      repository.softDelete(TENANT_A, 'p9', { id: 'u1', type: 'user' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('TenantCrudRepository — filtering, search and pagination', () => {
  it('searches across the configured searchable fields', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ search: 'tost' }));

    expect(result.data).toHaveLength(1);
    expect((result.data[0] as any).id).toBe('p2');
  });

  it('filters by status', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ status: 'inactive' }));

    expect(result.data.map((row: any) => row.id)).toEqual(['p2']);
  });

  it('filters by configured filterable fields', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ currencyCode: 'MXN' }));

    expect(result.data.map((row: any) => row.id)).toEqual(['p1']);
  });

  it('paginates and reports metadata', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ page: 2, limit: 1, sort: 'name', order: 'asc' }));

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });

  it('ignores a sort field that is not allow-listed', async () => {
    const { repository } = buildRepository();
    const result = await repository.list(TENANT_A, listQuery({ sort: 'basePrice' }));

    // Falls back to defaultSortField (createdAt) descending.
    expect((result.data[0] as any).id).toBe('p2');
  });

  it('counts and reads unpaginated rows', async () => {
    const { repository } = buildRepository();

    await expect(repository.count(TENANT_A)).resolves.toBe(2);
    await expect(repository.count(TENANT_A, { status: 'active' })).resolves.toBe(1);
    await expect(repository.findMany(TENANT_A, { status: 'active' })).resolves.toHaveLength(1);
  });
});

describe('TenantCrudRepository — writes, audit and soft delete', () => {
  it('stamps tenant and audit columns on create', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-NEW', name: 'Nueva', basePrice: 10, currencyCode: 'MXN' },
      { id: 'user-9', type: 'user' }
    );

    expect(created.tenantId).toBe(TENANT_A);
    expect(created.createdBy).toBe('user-9');
    expect(created.createdByType).toBe('user');
    expect(created.updatedBy).toBe('user-9');
  });

  it('records the api_key actor for key-driven writes', async () => {
    const { repository } = buildRepository();
    const created: any = await repository.create(
      TENANT_A,
      { sku: 'SKU-KEY', name: 'Key', basePrice: 1, currencyCode: 'MXN' },
      { id: 'key-1', type: 'api_key' }
    );

    expect(created.createdByType).toBe('api_key');
  });

  it('stamps updatedBy on update', async () => {
    const { repository } = buildRepository();
    const updated: any = await repository.update(
      TENANT_A,
      'p1',
      { name: 'Renombrada' },
      { id: 'user-2', type: 'user' }
    );

    expect(updated.name).toBe('Renombrada');
    expect(updated.updatedBy).toBe('user-2');
  });

  it('soft deletes by stamping deletedAt and deactivating', async () => {
    const { repository } = buildRepository();
    const removed: any = await repository.softDelete(TENANT_A, 'p1', { id: 'user-3', type: 'user' });

    expect(removed.deletedAt).toBeInstanceOf(Date);
    expect(removed.status).toBe('inactive');

    const listed = await repository.list(TENANT_A, listQuery());
    expect(listed.data.some((row: any) => row.id === 'p1')).toBe(false);
  });

  it('supports models without a deletedAt column', async () => {
    const prisma = createFakePrisma({
      priceHistory: [{ id: 'h1', tenantId: TENANT_A, reason: 'create' }]
    });
    const repository = new TenantCrudRepository(prisma, {
      model: 'priceHistory',
      tenantScoped: true,
      hasDeletedAt: false,
      hasStatus: false,
      searchableFields: ['reason'],
      filterableFields: [],
      defaultSortField: 'createdAt'
    });

    const listed = await repository.list(TENANT_A, listQuery());
    expect(listed.data).toHaveLength(1);
  });

  it('skips the status filter for models without a status column', async () => {
    const prisma = createFakePrisma({
      permission: [{ id: 'perm-1', slug: 'products:read', name: 'Read' }]
    });
    const repository = new TenantCrudRepository(prisma, {
      model: 'permission',
      tenantScoped: false,
      hasDeletedAt: true,
      hasStatus: false,
      searchableFields: ['slug'],
      filterableFields: [],
      defaultSortField: 'slug'
    });

    const listed = await repository.list(null, listQuery({ status: 'active' }));
    expect(listed.data).toHaveLength(1);
  });
});

describe('CrudService', () => {
  function buildService() {
    const { repository } = buildRepository();
    return new CrudService(repository, 'Product');
  }

  it('lists through the repository', async () => {
    const service = buildService();
    const result = await service.list(TENANT_A, listQuery());
    expect(result.meta.total).toBe(2);
  });

  it('throws NotFoundError for an unknown id', async () => {
    const service = buildService();
    await expect(service.get(TENANT_A, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the entity when found', async () => {
    const service = buildService();
    await expect(service.get(TENANT_A, 'p1')).resolves.toMatchObject({ id: 'p1' });
  });

  it('creates, updates and removes', async () => {
    const service = buildService();
    const actor = { id: 'u1', type: 'user' as const };

    const created: any = await service.create(TENANT_A, { sku: 'X', name: 'X' }, actor);
    expect(created.id).toBeTruthy();

    const updated: any = await service.update(TENANT_A, 'p1', { name: 'Updated' }, actor);
    expect(updated.name).toBe('Updated');

    const removed: any = await service.remove(TENANT_A, 'p2', actor);
    expect(removed.deletedAt).toBeInstanceOf(Date);
  });

  it('refuses to update a missing entity', async () => {
    const service = buildService();
    await expect(
      service.update(TENANT_A, 'missing', { name: 'x' }, { id: null, type: 'system' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('createCrudController', () => {
  function buildController() {
    const service = {
      list: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      get: jest.fn().mockResolvedValue({ id: 'p1' }),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'p1', name: 'updated' }),
      remove: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: 'x' })
    };
    return { service, controller: createCrudController(service as any) };
  }

  it('lists with the resolved tenant and parsed query', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ query: { page: '2', limit: '5' } });
    req.tenantId = TENANT_A;
    const res = mockResponse();

    await runHandler(controller.list, req, res);

    expect(service.list).toHaveBeenCalledWith(TENANT_A, expect.objectContaining({ page: 2, limit: 5 }));
    expect(res.body.data).toEqual([{ id: 'p1' }]);
  });

  it('gets by id', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ params: { id: 'p1' } });
    req.tenantId = TENANT_A;
    const res = mockResponse();

    await runHandler(controller.get, req, res);
    expect(service.get).toHaveBeenCalledWith(TENANT_A, 'p1');
  });

  it('creates with the actor context and returns 201', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ body: { name: 'New' } });
    req.tenantId = TENANT_A;
    req.user = { id: 'u1' };
    const res = mockResponse();

    await runHandler(controller.create, req, res);

    expect(service.create).toHaveBeenCalledWith(TENANT_A, { name: 'New' }, { id: 'u1', type: 'user' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updates and removes', async () => {
    const { service, controller } = buildController();
    const req = mockRequest({ params: { id: 'p1' }, body: { name: 'Updated' } });
    req.tenantId = TENANT_A;
    const res = mockResponse();

    await runHandler(controller.update, req, res);
    expect(service.update).toHaveBeenCalled();

    await runHandler(controller.remove, req, mockResponse());
    expect(service.remove).toHaveBeenCalled();
  });

  it('rejects a request without a tenant context', async () => {
    const { controller } = buildController();
    const req = mockRequest();
    req.tenantId = null;

    const error = await runHandler(controller.list, req, mockResponse());
    expect(error).toBeInstanceOf(UnauthorizedError);
  });
});

describe('controller helpers', () => {
  it('requireTenant returns the resolved tenant', () => {
    const req: any = { tenantId: 'tenant-1' };
    expect(requireTenant(req)).toBe('tenant-1');
  });

  it('requireTenant throws without a context', () => {
    expect(() => requireTenant({ tenantId: null } as any)).toThrow(UnauthorizedError);
  });

  it('requireActor prefers user, then api key, then system', () => {
    expect(requireActor({ user: { id: 'u1' } } as any)).toEqual({ id: 'u1', type: 'user' });
    expect(requireActor({ apiKey: { id: 'k1' } } as any)).toEqual({ id: 'k1', type: 'api_key' });
    expect(requireActor({ actor: { id: 'x', type: 'user' } } as any)).toEqual({ id: 'x', type: 'user' });
    expect(requireActor({} as any)).toEqual({ id: null, type: 'system' });
  });
});

describe('CRUD routers', () => {
  function controller() {
    return {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn()
    };
  }

  function stackOf(router: any, path: string, method: string): number {
    const layer = router.stack.find((item: any) => item.route?.path === path && item.route?.methods[method]);
    return layer ? layer.route.stack.length : 0;
  }

  it('registers the five CRUD routes with guards and permissions', () => {
    const guard = jest.fn();
    const router = createCrudRouter({
      controller: controller(),
      guards: [guard],
      permissions: { read: 'products:read', create: 'products:create' },
      createValidators: [jest.fn()],
      updateValidators: [jest.fn()]
    });

    expect(stackOf(router, '/', 'get')).toBe(3); // guard + permission + handler
    expect(stackOf(router, '/', 'post')).toBe(4); // guard + permission + validator + handler
    expect(stackOf(router, '/:id', 'delete')).toBe(2); // guard + handler (no delete permission)
  });

  it('registers read-only routes without write verbs', () => {
    const router = createReadOnlyRouter({
      controller: controller(),
      guards: [jest.fn()],
      readPermission: 'currencies:read'
    });

    expect(stackOf(router, '/', 'get')).toBe(3);
    expect(stackOf(router, '/', 'post')).toBe(0);
    expect(stackOf(router, '/:id', 'get')).toBe(3);
    expect(stackOf(router, '/:id', 'patch')).toBe(0);
  });
});
