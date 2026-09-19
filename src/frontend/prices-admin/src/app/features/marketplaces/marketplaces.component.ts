import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { MarketplaceService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { staticOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

@Component({
  selector: 'app-marketplaces',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Marketplaces"
      subtitle="Canales de venta donde se publican los precios."
      entityLabel="marketplace"
      searchPlaceholder="Buscar por nombre o código…"
      emptyMessage="Configura Amazon, Mercado Libre o tu tienda propia."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [canCreate]="can('marketplaces:create')"
      [canEdit]="can('marketplaces:update')"
      [canDelete]="can('marketplaces:delete')"
    />
  `
})
export class MarketplacesComponent {
  readonly service = inject(MarketplaceService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'code', label: 'Código' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Amazon' },
    {
      key: 'code',
      label: 'Código',
      type: 'select',
      required: true,
      options: staticOptions([
        ['amazon', 'Amazon'],
        ['mercadolibre', 'Mercado Libre'],
        ['own_store', 'Tienda propia']
      ])
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

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
