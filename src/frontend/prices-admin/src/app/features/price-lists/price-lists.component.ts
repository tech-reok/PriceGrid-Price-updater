import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { CurrencyService, PriceListService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader, staticOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig, PayloadMapper } from '../../shared/crud-page.types';

@Component({
  selector: 'app-price-lists',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Listas de precios"
      subtitle="Agrupa precios por canal o segmento y asígnalos a marketplaces."
      entityLabel="lista de precios"
      searchPlaceholder="Buscar por nombre…"
      emptyMessage="Crea listas como Retail, Wholesale o Marketplace."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [canCreate]="can('price-lists:create')"
      [canEdit]="can('price-lists:update')"
      [canDelete]="can('price-lists:delete')"
    />
  `
})
export class PriceListsComponent {
  readonly service = inject(PriceListService);
  private readonly currencyService = inject(CurrencyService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'description', label: 'Descripción' },
    { key: 'currencyCode', label: 'Moneda' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Retail' },
    { key: 'description', label: 'Descripción', type: 'text', placeholder: 'Lista de precios minorista' },
    {
      key: 'currencyCode',
      label: 'Moneda',
      type: 'select',
      optionsKey: 'currencies',
      help: 'Opcional: si se omite se usa la moneda de la empresa.'
    },
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
    }
  ];

  readonly selectSources = {
    currencies: currencyOptionLoader(this.currencyService)
  };

  /** The optional currency select sends '' when unset; the API expects null. */
  readonly mapToPayload: PayloadMapper = (values) => ({
    ...values,
    currencyCode: values['currencyCode'] ? values['currencyCode'] : null
  });

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
