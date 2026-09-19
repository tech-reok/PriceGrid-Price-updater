import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ProductService, CurrencyService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader } from '../../core/utils/options';
import { staticOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Productos"
      subtitle="Catálogo de productos y su precio base."
      entityLabel="producto"
      searchPlaceholder="Buscar por SKU o nombre…"
      emptyMessage="Crea tu primer producto para empezar a capturar precios."
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
    { key: 'sku', label: 'SKU', sortable: true },
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'basePrice', label: 'Precio base', type: 'money', currencyKey: 'currencyCode', align: 'right' },
    { key: 'currencyCode', label: 'Moneda' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'sku', label: 'SKU', type: 'text', required: true, placeholder: 'SKU-001' },
    { key: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre del producto' },
    { key: 'basePrice', label: 'Precio base', type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'currencyCode', label: 'Moneda', type: 'select', required: true, optionsKey: 'currencies' },
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
    { key: 'description', label: 'Descripción', type: 'textarea', full: true }
  ];

  readonly selectSources = {
    currencies: currencyOptionLoader(this.currencyService)
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
