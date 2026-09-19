import { Component, inject, viewChild } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ApiKeyService } from '../../core/services/access.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { staticOptions } from '../../core/utils/options';
import { extractApiErrorMessage, toDateInputValue } from '../../core/utils/format';
import type { ColumnConfig, FieldConfig, RowAction } from '../../shared/crud-page.types';

/** Read-only integration keys for the external API (phase 1). */
@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="API Keys"
      subtitle="Llaves de sólo lectura para la API externa. La llave completa se muestra una única vez."
      entityLabel="API key"
      searchPlaceholder="Buscar por nombre o prefijo…"
      emptyMessage="Genera una llave para que tus integraciones consulten precios."
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [rowActions]="rowActions"
      [mapToForm]="mapToForm"
      [mapToPayload]="mapToPayload"
      [canCreate]="can('api-keys:create')"
      [canEdit]="can('api-keys:update')"
      [canDelete]="can('api-keys:delete')"
      [statusFilter]="false"
    />
  `
})
export class ApiKeysComponent {
  readonly service = inject(ApiKeyService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  private readonly crudPage = viewChild(CrudPageComponent);

  readonly columns: ColumnConfig[] = [
    { key: 'name', label: 'Nombre', sortable: true },
    { key: 'prefix', label: 'Prefijo' },
    { key: 'scopes', label: 'Scopes' },
    { key: 'effectiveStatus', label: 'Estado', type: 'status' },
    { key: 'expiresAt', label: 'Expira', type: 'date' },
    { key: 'lastUsedAt', label: 'Último uso', type: 'date' }
  ];

  readonly fields: FieldConfig[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Integración marketplace' },
    {
      key: 'scope',
      label: 'Scope (sólo lectura en fase 1)',
      type: 'select',
      required: true,
      defaultValue: 'products:read',
      full: true,
      options: staticOptions([
        ['products:read', 'products:read — Productos (lectura)'],
        ['prices:read', 'prices:read — Precios (lectura)'],
        ['price-lists:read', 'price-lists:read — Listas de precios (lectura)'],
        ['marketplaces:read', 'marketplaces:read — Marketplaces (lectura)']
      ])
    },
    { key: 'expiresAt', label: 'Expira el', type: 'date', help: 'Opcional: sin fecha la llave no expira.' }
  ];

  readonly mapToForm = (row: Record<string, any>): Record<string, unknown> => ({
    name: row['name'] ?? '',
    scope: Array.isArray(row['scopes']) ? (row['scopes'][0] ?? 'products:read') : 'products:read',
    expiresAt: toDateInputValue(row['expiresAt'])
  });

  readonly mapToPayload = (values: Record<string, unknown>): Record<string, unknown> => ({
    name: values['name'],
    scopes: [String(values['scope'])],
    expiresAt: values['expiresAt'] ? new Date(String(values['expiresAt'])).toISOString() : null
  });

  /** Revoking persists `revoked_at`; `expired` stays derived from `expires_at`. */
  readonly rowActions: RowAction[] = [
    {
      label: 'Revocar',
      tone: 'danger',
      visible: (row) => row.effectiveStatus !== 'revoked',
      run: (row) => this.revoke(row)
    }
  ];

  private revoke(row: Record<string, any>): void {
    this.service.revoke(String(row['id'])).subscribe({
      next: () => {
        this.toast.success('API key revocada');
        this.crudPage()?.refresh();
      },
      error: (error: unknown) => this.toast.error(extractApiErrorMessage(error))
    });
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
