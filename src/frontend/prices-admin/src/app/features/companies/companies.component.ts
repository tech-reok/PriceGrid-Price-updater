import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { CurrencyService } from '../../core/services/catalog.services';
import { TenantService } from '../../core/services/access.services';
import { SessionStore } from '../../core/services/session.store';
import { currencyOptionLoader, staticOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig } from '../../shared/crud-page.types';

/** Companies (tenants). Visible and manageable only by the global admin. */
@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Empresas"
      subtitle="Administración global de empresas. Selecciona la empresa activa desde el encabezado."
      entityLabel="empresa"
      searchPlaceholder="Buscar por nombre o slug…"
      emptyMessage="Crea la primera empresa para empezar a operar."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [selectSources]="selectSources"
      [canCreate]="can('tenants:create')"
      [canEdit]="can('tenants:update')"
      [canDelete]="can('tenants:delete')"
    />
  `
})
export class CompaniesComponent {
  readonly service = inject(TenantService);
  private readonly currencyService = inject(CurrencyService);
  private readonly session = inject(SessionStore);

  readonly columns: ColumnConfig[] = [
    { key: 'commercialName', label: 'Nombre comercial', sortable: true },
    { key: 'legalName', label: 'Razón social' },
    { key: 'slug', label: 'Slug' },
    { key: 'defaultCurrency', label: 'Moneda' },
    { key: 'status', label: 'Estado', type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'commercialName', label: 'Nombre comercial', type: 'text', required: true },
    { key: 'legalName', label: 'Razón social', type: 'text', required: true },
    { key: 'slug', label: 'Slug', type: 'text', required: true, placeholder: 'mi-empresa', help: 'Minúsculas y guiones.' },
    { key: 'defaultCurrency', label: 'Moneda por defecto', type: 'select', required: true, optionsKey: 'currencies' },
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
    currencies: currencyOptionLoader(this.currencyService)
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
