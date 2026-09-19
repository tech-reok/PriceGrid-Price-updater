import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CrudResource } from './crud-resource';
import type {
  Currency,
  Discount,
  Marketplace,
  Permission,
  PriceHistoryEntry,
  PriceList,
  Product
} from '../models';

@Injectable({ providedIn: 'root' })
export class ProductService extends CrudResource<Product> {
  constructor(http: HttpClient) {
    super(http, 'products');
  }
}

@Injectable({ providedIn: 'root' })
export class MarketplaceService extends CrudResource<Marketplace> {
  constructor(http: HttpClient) {
    super(http, 'marketplaces');
  }
}

@Injectable({ providedIn: 'root' })
export class PriceListService extends CrudResource<PriceList> {
  constructor(http: HttpClient) {
    super(http, 'price-lists');
  }

  /** Replaces the product links of a price list. */
  setProducts(id: string, ids: string[]) {
    return this.http.put<{ productIds: string[] }>(`${this.baseUrl}/${id}/products`, { ids });
  }

  /** Replaces the marketplace links of a price list. */
  setMarketplaces(id: string, ids: string[]) {
    return this.http.put<{ marketplaceIds: string[] }>(`${this.baseUrl}/${id}/marketplaces`, { ids });
  }
}

@Injectable({ providedIn: 'root' })
export class DiscountService extends CrudResource<Discount> {
  constructor(http: HttpClient) {
    super(http, 'discounts');
  }
}

/** Price history is append-only: the API only exposes read endpoints. */
@Injectable({ providedIn: 'root' })
export class PriceHistoryService extends CrudResource<PriceHistoryEntry> {
  constructor(http: HttpClient) {
    super(http, 'price-history');
  }
}

/** Currencies are read-only in phase 1. */
@Injectable({ providedIn: 'root' })
export class CurrencyService extends CrudResource<Currency> {
  constructor(http: HttpClient) {
    super(http, 'currencies');
  }

  byCode(code: string) {
    return this.http.get<Currency>(`${this.baseUrl}/${code}`);
  }
}

@Injectable({ providedIn: 'root' })
export class PermissionService extends CrudResource<Permission> {
  constructor(http: HttpClient) {
    super(http, 'permissions');
  }
}
