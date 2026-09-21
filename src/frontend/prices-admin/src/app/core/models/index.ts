/**
 * Shared domain types for the PriceGrid admin frontend.
 * These mirror the payloads returned by the Express API.
 */

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: unknown;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: { field?: string; message: string }[];
  traceId?: string;
  timestamp?: string;
}

// --- Auth ------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleSlug: string;
  tenantId: string | null;
  isGlobalAdmin: boolean;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// --- Catalogs --------------------------------------------------------------

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  status: string;
}

export interface Tenant {
  id: string;
  commercialName: string;
  legalName: string;
  slug: string;
  status: string;
  defaultCurrency: string;
  timeZone: string;
  notes?: string | null;
  currency?: Currency;
}

export interface Permission {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface Role {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  description?: string | null;
  isSystem: boolean;
  status: string;
  rolePermissions?: { permission: Permission }[];
  _count?: { users: number };
}

export interface User {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  roleId: string;
  status: string;
  lastLoginAt?: string | null;
  role?: Role;
  tenant?: Tenant;
}

export interface PriceListAccess {
  userId: string;
  priceListIds: string[];
  priceLists: PriceList[];
}

// --- Pricing ---------------------------------------------------------------

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description?: string | null;
  basePrice: number;
  currencyCode: string;
  status: string;
  currency?: Currency;
}

export interface Marketplace {
  id: string;
  tenantId: string;
  name: string;
  code: 'amazon' | 'mercadolibre' | 'own_store';
  config?: Record<string, unknown> | null;
  status: string;
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  currencyCode?: string | null;
  status: string;
  currency?: Currency | null;
  priceListProducts?: { product: Product }[];
  priceListMarketplaces?: { marketplace: Marketplace }[];
}

export interface Price {
  id: string;
  tenantId: string;
  productId: string;
  priceListId: string;
  marketplaceId: string;
  basePrice: number;
  currencyCode: string;
  finalPrice: number;
  startDate: string;
  endDate?: string | null;
  status: string;
  notes?: string | null;
  product?: Product;
  priceList?: PriceList;
  marketplace?: Marketplace;
  currency?: Currency;
}

export interface PriceCalculation {
  basePrice: number;
  finalPrice: number;
  discountAmount: number;
  scope: 'product' | 'price_list' | 'marketplace' | 'base';
  appliedDiscount: {
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    value: number;
    appliesTo: string;
    priority: number;
  } | null;
}

export interface Discount {
  id: string;
  tenantId: string;
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  appliesTo: 'product' | 'price_list' | 'marketplace';
  productId?: string | null;
  priceListId?: string | null;
  marketplaceId?: string | null;
  startDate: string;
  endDate?: string | null;
  priority: number;
  status: string;
  description?: string | null;
  product?: Product;
  priceList?: PriceList;
  marketplace?: Marketplace;
}

export interface CatalogRow {
  product: { id: string; sku: string; name: string };
  priceList: { id: string; name: string };
  marketplace: { id: string; name: string; code: string };
  basePrice: number;
  discountAmount: number;
  finalPrice: number;
  scope: 'product' | 'price_list' | 'marketplace' | 'base';
  appliedDiscount: {
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    value: number;
    appliesTo: string;
    priority: number;
  } | null;
  currencyCode: string;
  calculatedAt: string;
}

export interface ExportRequest {
  id: string;
  priceListId: string;
  marketplaceId: string;
  format: 'csv' | 'json' | 'txt';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
  fileName?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
}

export interface PriceHistoryEntry {
  id: string;
  tenantId: string;
  priceId: string;
  productId: string;
  oldBasePrice?: number | null;
  newBasePrice?: number | null;
  oldFinalPrice?: number | null;
  newFinalPrice?: number | null;
  changedByType: 'user' | 'api_key' | 'system';
  changedById?: string | null;
  reason: string;
  createdAt: string;
  product?: Product;
}

// --- API keys --------------------------------------------------------------

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: 'active' | 'revoked';
  effectiveStatus: 'active' | 'revoked' | 'expired';
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  plaintextKey?: string;
}

// --- Dashboard -------------------------------------------------------------

export interface DashboardSummary {
  activeProducts: number;
  marketplaces: number;
  priceLists: number;
  activePrices: number;
  expiringWindowDays: number;
  expiringDiscounts: Discount[];
}

export interface MarketplaceChartPoint {
  marketplaceId: string;
  name: string;
  code: string | null;
  priceCount: number;
  averageFinalPrice: number;
}
