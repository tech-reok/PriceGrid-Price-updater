/** Injection tokens used by the tsyringe composition root. */
export const TOKENS = {
  Prisma: 'PrismaClient',

  // Repositories
  AuthRepository: 'AuthRepository',
  ApiKeyRepository: 'ApiKeyRepository',
  TenantRepository: 'TenantRepository',
  UserRepository: 'UserRepository',
  RoleRepository: 'RoleRepository',
  ProductRepository: 'ProductRepository',
  MarketplaceRepository: 'MarketplaceRepository',
  PriceListRepository: 'PriceListRepository',
  PriceRepository: 'PriceRepository',
  PriceHistoryRepository: 'PriceHistoryRepository',
  DiscountRepository: 'DiscountRepository',
  CurrencyRepository: 'CurrencyRepository',
  PermissionRepository: 'PermissionRepository',

  // Services
  AuthService: 'AuthService',
  ApiKeyService: 'ApiKeyService',
  TenantService: 'TenantService',
  UserService: 'UserService',
  RoleService: 'RoleService',
  ProductService: 'ProductService',
  MarketplaceService: 'MarketplaceService',
  PriceListService: 'PriceListService',
  PriceService: 'PriceService',
  PriceHistoryService: 'PriceHistoryService',
  DiscountService: 'DiscountService',
  CurrencyService: 'CurrencyService',
  PermissionService: 'PermissionService',
  DashboardService: 'DashboardService',
  PriceListAccessService: 'PriceListAccessService',
  PriceCatalogService: 'PriceCatalogService',
  ExportService: 'ExportService',
  ExportStorage: 'ExportStorage',

  // Controllers
  AuthController: 'AuthController',
  TenantController: 'TenantController',
  ApiKeyController: 'ApiKeyController',
  UserController: 'UserController',
  RoleController: 'RoleController',
  ProductController: 'ProductController',
  MarketplaceController: 'MarketplaceController',
  PriceListController: 'PriceListController',
  PriceController: 'PriceController',
  PriceHistoryController: 'PriceHistoryController',
  DiscountController: 'DiscountController',
  CurrencyController: 'CurrencyController',
  PermissionController: 'PermissionController',
  DashboardController: 'DashboardController',
  PriceCatalogController: 'PriceCatalogController',
  ExportController: 'ExportController',
  ExternalController: 'ExternalController'
} as const;

export type TokenName = (typeof TOKENS)[keyof typeof TOKENS];
