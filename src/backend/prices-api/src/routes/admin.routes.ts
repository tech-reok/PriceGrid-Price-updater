import { Router } from 'express';
import { container } from 'tsyringe';
import { TOKENS } from '../di/tokens';
import { createJwtAuthMiddleware, requireGlobalAdmin, requirePermission } from '../middlewares/auth';
import { requireTenantContext, resolveTenant } from '../middlewares/tenant';
import { validate } from '../middlewares/validate';
import { createCrudController } from '../common/crud/controller';
import { createCrudRouter, createReadOnlyRouter } from '../common/crud/router';
import type { CrudController } from '../common/crud/types';
import type { AuthService } from '../services/auth.service';
import type { RoleController } from '../controllers/role.controller';
import type { PriceListController } from '../controllers/price-list.controller';
import type { ApiKeyController } from '../controllers/api-key.controller';
import type { TenantController } from '../controllers/tenant.controller';
import type { PriceController } from '../controllers/price.controller';
import type { DashboardController } from '../controllers/dashboard.controller';
import type { PriceCatalogController } from '../controllers/price-catalog.controller';
import type { ExportController } from '../controllers/export.controller';
import {
  assignPermissionsSchema,
  createApiKeySchema,
  createRoleSchema,
  createTenantSchema,
  createUserSchema,
  updateApiKeySchema,
  updateRoleSchema,
  updateTenantSchema,
  updateTenantTimeZoneSchema,
  updateUserSchema
} from '../validators/access.validators';
import {
  calculatePriceSchema,
  createDiscountSchema,
  createMarketplaceSchema,
  createPriceListSchema,
  createPriceSchema,
  createProductSchema,
  setRelationsSchema,
  updateDiscountSchema,
  updateMarketplaceSchema,
  updatePriceListSchema,
  updatePriceSchema,
  updateProductSchema
} from '../validators/pricing.validators';
import {
  catalogMarketplacesQuerySchema,
  catalogQuerySchema,
  exportRequestSchema,
  priceListAccessSchema
} from '../validators/catalog.validators';

/** Administrative API (JWT + tenant context + RBAC). */
export function createAdminRouter(): Router {
  const router = Router();

  const authService = container.resolve<AuthService>(TOKENS.AuthService);
  const jwtAuth = createJwtAuthMiddleware(authService);
  const guards = [jwtAuth, resolveTenant, requireTenantContext];
  const priceCatalogController = container.resolve<PriceCatalogController>(TOKENS.PriceCatalogController);
  const exportController = container.resolve<ExportController>(TOKENS.ExportController);

  const crud = (token: string): CrudController =>
    createCrudController(container.resolve<any>(token));

  // --- Companies / tenants (global admin) ---------------------------------
  const tenantController = container.resolve<TenantController>(TOKENS.TenantController);
  const tenantRouter = Router();
  tenantRouter.get('/me', jwtAuth, resolveTenant, requireTenantContext, tenantController.me);
  tenantRouter.get(
    '/me/time-zone',
    jwtAuth,
    resolveTenant,
    requireTenantContext,
    requirePermission('settings:read'),
    tenantController.timeZone
  );
  tenantRouter.patch(
    '/me/time-zone',
    jwtAuth,
    resolveTenant,
    requireTenantContext,
    requirePermission('settings:update'),
    validate(updateTenantTimeZoneSchema),
    tenantController.updateTimeZone
  );
  tenantRouter.get('/', jwtAuth, requireGlobalAdmin, requirePermission('tenants:read'), tenantController.list);
  tenantRouter.get('/:id', jwtAuth, requireGlobalAdmin, requirePermission('tenants:read'), tenantController.get);
  tenantRouter.post(
    '/',
    jwtAuth,
    requireGlobalAdmin,
    requirePermission('tenants:create'),
    validate(createTenantSchema),
    tenantController.create
  );
  tenantRouter.patch(
    '/:id',
    jwtAuth,
    requireGlobalAdmin,
    requirePermission('tenants:update'),
    validate(updateTenantSchema),
    tenantController.update
  );
  tenantRouter.delete(
    '/:id',
    jwtAuth,
    requireGlobalAdmin,
    requirePermission('tenants:delete'),
    tenantController.remove
  );
  router.use('/tenants', tenantRouter);

  // --- Users ---------------------------------------------------------------
  router.use(
    '/users',
    createCrudRouter({
      controller: crud(TOKENS.UserService),
      guards,
      permissions: {
        read: 'users:read',
        create: 'users:create',
        update: 'users:update',
        delete: 'users:delete'
      },
      createValidators: [validate(createUserSchema)],
      updateValidators: [validate(updateUserSchema)]
    })
  );

  router.get(
    '/users/:id/price-list-access',
    ...guards,
    requirePermission('price-list-access:read'),
    priceCatalogController.access
  );
  router.put(
    '/users/:id/price-list-access',
    ...guards,
    requirePermission('price-list-access:manage'),
    validate(priceListAccessSchema),
    priceCatalogController.replaceAccess
  );

  router.get(
    '/price-catalog/price-lists',
    ...guards,
    requirePermission('price-catalog:read'),
    priceCatalogController.priceLists
  );
  router.get(
    '/price-catalog/marketplaces',
    ...guards,
    requirePermission('price-catalog:read'),
    validate(catalogMarketplacesQuerySchema, 'query'),
    priceCatalogController.marketplaces
  );
  router.get(
    '/price-catalog',
    ...guards,
    requirePermission('price-catalog:read'),
    validate(catalogQuerySchema, 'query'),
    priceCatalogController.list
  );
  router.post(
    '/price-catalog/exports',
    ...guards,
    requirePermission('price-catalog:export'),
    validate(exportRequestSchema),
    exportController.create
  );
  router.get(
    '/price-catalog/exports',
    ...guards,
    requirePermission('price-catalog:export'),
    exportController.list
  );
  router.get(
    '/price-catalog/exports/:id',
    ...guards,
    requirePermission('price-catalog:export'),
    exportController.get
  );
  router.get(
    '/price-catalog/exports/:id/download',
    ...guards,
    requirePermission('price-catalog:export'),
    exportController.download
  );

  // --- Roles (+ permissions assignment) ------------------------------------
  const roleController = container.resolve<RoleController>(TOKENS.RoleController);
  const rolesRouter = createCrudRouter({
    controller: crud(TOKENS.RoleService),
    guards,
    permissions: {
      read: 'roles:read',
      create: 'roles:create',
      update: 'roles:update',
      delete: 'roles:delete'
    },
    createValidators: [validate(createRoleSchema)],
    updateValidators: [validate(updateRoleSchema)]
  });
  rolesRouter.get('/:id/permissions', ...guards, requirePermission('roles:read'), roleController.permissions);
  rolesRouter.put(
    '/:id/permissions',
    ...guards,
    requirePermission('roles:assign-permissions'),
    validate(assignPermissionsSchema),
    roleController.assignPermissions
  );
  router.use('/roles', rolesRouter);

  // --- Read-only catalogs --------------------------------------------------
  router.use(
    '/permissions',
    createReadOnlyRouter({
      controller: crud(TOKENS.PermissionService),
      guards,
      readPermission: 'permissions:read'
    })
  );

  router.use(
    '/currencies',
    createReadOnlyRouter({
      controller: crud(TOKENS.CurrencyService),
      guards,
      readPermission: 'currencies:read'
    })
  );

  router.use(
    '/price-history',
    createReadOnlyRouter({
      controller: crud(TOKENS.PriceHistoryService),
      guards,
      readPermission: 'price-history:read'
    })
  );

  // --- Products ------------------------------------------------------------
  router.use(
    '/products',
    createCrudRouter({
      controller: crud(TOKENS.ProductService),
      guards,
      permissions: {
        read: 'products:read',
        create: 'products:create',
        update: 'products:update',
        delete: 'products:delete'
      },
      createValidators: [validate(createProductSchema)],
      updateValidators: [validate(updateProductSchema)]
    })
  );

  // --- Marketplaces --------------------------------------------------------
  router.use(
    '/marketplaces',
    createCrudRouter({
      controller: crud(TOKENS.MarketplaceService),
      guards,
      permissions: {
        read: 'marketplaces:read',
        create: 'marketplaces:create',
        update: 'marketplaces:update',
        delete: 'marketplaces:delete'
      },
      createValidators: [validate(createMarketplaceSchema)],
      updateValidators: [validate(updateMarketplaceSchema)]
    })
  );

  // --- Price lists (+ product/marketplace relations) -----------------------
  const priceListController = container.resolve<PriceListController>(TOKENS.PriceListController);
  const priceListsRouter = createCrudRouter({
    controller: crud(TOKENS.PriceListService),
    guards,
    permissions: {
      read: 'price-lists:read',
      create: 'price-lists:create',
      update: 'price-lists:update',
      delete: 'price-lists:delete'
    },
    createValidators: [validate(createPriceListSchema)],
    updateValidators: [validate(updatePriceListSchema)]
  });
  priceListsRouter.put(
    '/:id/products',
    ...guards,
    requirePermission('price-lists:update'),
    validate(setRelationsSchema),
    priceListController.setProducts
  );
  priceListsRouter.put(
    '/:id/marketplaces',
    ...guards,
    requirePermission('price-lists:update'),
    validate(setRelationsSchema),
    priceListController.setMarketplaces
  );
  router.use('/price-lists', priceListsRouter);

  // --- Prices (+ calculate + history) --------------------------------------
  const priceController = container.resolve<PriceController>(TOKENS.PriceController);
  const pricesRouter = Router();
  pricesRouter.get('/', ...guards, requirePermission('prices:read'), priceController.list);
  pricesRouter.post(
    '/calculate',
    ...guards,
    requirePermission('prices:calculate'),
    validate(calculatePriceSchema),
    priceController.calculate
  );
  pricesRouter.get('/:id', ...guards, requirePermission('prices:read'), priceController.get);
  pricesRouter.get('/:id/history', ...guards, requirePermission('prices:read'), priceController.history);
  pricesRouter.post(
    '/:id/calculate',
    ...guards,
    requirePermission('prices:calculate'),
    priceController.calculateExisting
  );
  pricesRouter.post(
    '/',
    ...guards,
    requirePermission('prices:create'),
    validate(createPriceSchema),
    priceController.create
  );
  pricesRouter.patch(
    '/:id',
    ...guards,
    requirePermission('prices:update'),
    validate(updatePriceSchema),
    priceController.update
  );
  pricesRouter.delete('/:id', ...guards, requirePermission('prices:delete'), priceController.remove);
  router.use('/prices', pricesRouter);

  // --- Discounts -----------------------------------------------------------
  router.use(
    '/discounts',
    createCrudRouter({
      controller: crud(TOKENS.DiscountService),
      guards,
      permissions: {
        read: 'discounts:read',
        create: 'discounts:create',
        update: 'discounts:update',
        delete: 'discounts:delete'
      },
      createValidators: [validate(createDiscountSchema)],
      updateValidators: [validate(updateDiscountSchema)]
    })
  );

  // --- API keys ------------------------------------------------------------
  const apiKeyController = container.resolve<ApiKeyController>(TOKENS.ApiKeyController);
  const apiKeysRouter = Router();
  apiKeysRouter.get('/', ...guards, requirePermission('api-keys:read'), apiKeyController.list);
  apiKeysRouter.post(
    '/',
    ...guards,
    requirePermission('api-keys:create'),
    validate(createApiKeySchema),
    apiKeyController.create
  );
  apiKeysRouter.get('/:id', ...guards, requirePermission('api-keys:read'), apiKeyController.get);
  apiKeysRouter.patch(
    '/:id',
    ...guards,
    requirePermission('api-keys:update'),
    validate(updateApiKeySchema),
    apiKeyController.update
  );
  apiKeysRouter.post('/:id/revoke', ...guards, requirePermission('api-keys:revoke'), apiKeyController.revoke);
  apiKeysRouter.delete('/:id', ...guards, requirePermission('api-keys:delete'), apiKeyController.remove);
  router.use('/api-keys', apiKeysRouter);

  // --- Dashboard -----------------------------------------------------------
  const dashboardController = container.resolve<DashboardController>(TOKENS.DashboardController);
  router.get('/dashboard/summary', ...guards, requirePermission('dashboard:read'), dashboardController.summary);
  router.get(
    '/dashboard/recent-prices',
    ...guards,
    requirePermission('dashboard:read'),
    dashboardController.recentPrices
  );
  router.get(
    '/dashboard/prices-by-marketplace',
    ...guards,
    requirePermission('dashboard:read'),
    dashboardController.pricesByMarketplace
  );

  return router;
}
