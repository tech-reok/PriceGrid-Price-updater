import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ProductService, CurrencyService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader, recordStatusOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'products.title' }"
      [subtitle]="{ key: 'products.subtitle' }"
      [entityLabel]="{ key: 'products.entity' }"
      [searchPlaceholder]="{ key: 'products.searchPlaceholder' }"
      [emptyMessage]="{ key: 'products.emptyMessage' }"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [canCreate]="can('products:create')"
      [canEdit]="can('products:update')"
      [canDelete]="can('products:delete')"
    />
  `
})
export class ProductsComponent {
  readonly service = inject(ProductService);
  private readonly currencyService = inject(CurrencyService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'sku', label: { key: 'products.columns.sku' }, sortable: true },
    { key: 'name', label: { key: 'common.name' }, sortable: true },
    { key: 'basePrice', label: { key: 'common.basePrice' }, type: 'money', currencyKey: 'currencyCode', align: 'right' },
    { key: 'currencyCode', label: { key: 'common.currency' } },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'sku', label: { key: 'products.columns.sku' }, type: 'text', required: true, placeholder: { text: 'SKU-001' } },
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      placeholder: { key: 'products.fields.namePlaceholder' }
    },
    { key: 'basePrice', label: { key: 'common.basePrice' }, type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'currencyCode', label: { key: 'common.currency' }, type: 'select', required: true, optionsKey: 'currencies' },
    {
      key: 'status',
      label: { key: 'common.status' },
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: recordStatusOptions()
    },
    { key: 'description', label: { key: 'common.description' }, type: 'textarea', full: true }
  ];

  readonly selectSources = {
    currencies: currencyOptionLoader(this.currencyService)
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
