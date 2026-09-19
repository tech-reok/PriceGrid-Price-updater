import { Component, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { CrudPageComponent } from '../../shared/crud-page.component';
import {
  CurrencyService,
  MarketplaceService,
  PriceListService,
  ProductService
} from '../../core/services/catalog.services';
import { PriceService } from '../../core/services/price.service';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader, idOptionLoader, staticOptions } from '../../core/utils/options';
import { formatMoney, toDateInputValue } from '../../core/utils/format';
import type {
  ColumnConfig,
  FieldConfig,
  PayloadMapper,
  PreviewRunner,
  PreviewResult
} from '../../shared/crud-page.types';

@Component({
  selector: 'app-prices',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Precios"
      subtitle="Precio por producto, lista y marketplace, con cálculo de precio final."
      entityLabel="precio"
      searchPlaceholder="Buscar por notas…"
      emptyMessage="Registra el primer precio para ver el cálculo del descuento aplicable."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [previewRunner]="previewRunner"
      previewLabel="Calcular precio final"
      [mapToForm]="mapToForm"
      [mapToPayload]="mapToPayload"
      [canCreate]="can('prices:create')"
      [canEdit]="can('prices:update')"
      [canDelete]="can('prices:delete')"
    />
  `
})
export class PricesComponent {
  readonly service = inject(PriceService);
  private readonly productService = inject(ProductService);
  private readonly priceListService = inject(PriceListService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly currencyService = inject(CurrencyService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'product.name', label: 'Producto', sortable: false },
    { key: 'priceList.name', label: 'Lista' },
    { key: 'marketplace.name', label: 'Marketplace' },
    { key: 'basePrice', label: 'Precio base', type: 'money', currencyKey: 'currencyCode', align: 'right' },
    { key: 'finalPrice', label: 'Precio final', type: 'money', currencyKey: 'currencyCode', align: 'right' },
    { key: 'startDate', label: 'Vigente desde', type: 'date' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'productId', label: 'Producto', type: 'select', required: true, optionsKey: 'products' },
    { key: 'priceListId', label: 'Lista de precios', type: 'select', required: true, optionsKey: 'priceLists' },
    { key: 'marketplaceId', label: 'Marketplace', type: 'select', required: true, optionsKey: 'marketplaces' },
    { key: 'basePrice', label: 'Precio base', type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'currencyCode', label: 'Moneda', type: 'select', required: true, optionsKey: 'currencies' },
    { key: 'startDate', label: 'Fecha de inicio', type: 'date', required: true },
    { key: 'endDate', label: 'Fecha de fin', type: 'date', help: 'Opcional: sin fecha fin el precio es indefinido.' },
    {
      key: 'status',
      label: 'Estado',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: staticOptions([
        ['active', 'Activo'],
        ['inactive', 'Inactivo']
      ])
    },
    { key: 'notes', label: 'Notas', type: 'textarea', full: true }
  ];

  readonly selectSources = {
    products: () =>
      this.productService.list({ limit: 100 }).pipe(
        map((response) =>
          response.data.map((product) => ({
            value: product.id,
            label: `${product.sku} — ${product.name}`
          }))
        )
      ),
    priceLists: idOptionLoader(this.priceListService, 'name'),
    marketplaces: idOptionLoader(this.marketplaceService, 'name'),
    currencies: currencyOptionLoader(this.currencyService)
  };

  /** Converts API values into form values (dates need yyyy-MM-dd). */
  readonly mapToForm = (row: Record<string, any>): Record<string, unknown> => ({
    productId: row['productId'] ?? '',
    priceListId: row['priceListId'] ?? '',
    marketplaceId: row['marketplaceId'] ?? '',
    basePrice: row['basePrice'] ?? 0,
    currencyCode: row['currencyCode'] ?? 'MXN',
    startDate: toDateInputValue(row['startDate']),
    endDate: toDateInputValue(row['endDate']),
    status: row['status'] ?? 'active',
    notes: row['notes'] ?? ''
  });

  /** Converts form values into the API payload (dates back to ISO). */
  readonly mapToPayload: PayloadMapper = (values, context) => {
    const payload: Record<string, unknown> = { ...values };

    // References are immutable after creation: the API rejects them on update.
    if (context.isEditing) {
      delete payload['productId'];
      delete payload['priceListId'];
      delete payload['marketplaceId'];
    }

    if (values['startDate']) {
      payload['startDate'] = new Date(String(values['startDate'])).toISOString();
    }
    payload['endDate'] = values['endDate']
      ? new Date(String(values['endDate'])).toISOString()
      : null;
    return payload;
  };

  /** Calls POST /prices/calculate and renders the single applied discount. */
  readonly previewRunner: PreviewRunner = (values) => {
    const currencyCode = String(values['currencyCode'] ?? 'MXN');

    return this.service
      .calculate({
        productId: String(values['productId'] ?? ''),
        priceListId: String(values['priceListId'] ?? ''),
        marketplaceId: String(values['marketplaceId'] ?? ''),
        basePrice: Number(values['basePrice'] ?? 0),
        currencyCode
      })
      .pipe(
        map((result): PreviewResult[] => [
          { label: 'Precio base', value: formatMoney(result.basePrice, currencyCode) },
          {
            label: 'Descuento aplicado',
            value: result.appliedDiscount ? result.appliedDiscount.name : 'Ninguno',
            hint: result.appliedDiscount
              ? `${result.scope} · ${formatMoney(result.discountAmount, currencyCode)}`
              : 'Se usa el precio base'
          },
          { label: 'Precio final', value: formatMoney(result.finalPrice, currencyCode) }
        ])
      );
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
