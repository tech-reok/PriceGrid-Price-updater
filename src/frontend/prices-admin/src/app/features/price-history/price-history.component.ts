import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { PriceHistoryService } from '../../core/services/catalog.services';
import type { ColumnConfig } from '../../shared/crud-page.types';

/** Append-only audit trail: read-only in phase 1. */
@Component({
  selector: 'app-price-history',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      title="Historial de precios"
      subtitle="Registro append-only de cada cambio de precio base o final."
      entityLabel="movimiento"
      searchPlaceholder="Buscar por motivo…"
      emptyMessage="Aún no hay cambios de precio registrados."
      [columns]="columns"
      [fields]="[]"
      [service]="service"
      [statusFilter]="false"
      [canCreate]="false"
      [canEdit]="false"
      [canDelete]="false"
      [pageSize]="20"
    />
  `
})
export class PriceHistoryComponent {
  readonly service = inject(PriceHistoryService);

  readonly columns: ColumnConfig[] = [
    { key: 'createdAt', label: 'Fecha', type: 'date' },
    { key: 'product.name', label: 'Producto' },
    { key: 'oldBasePrice', label: 'Base anterior', type: 'money', align: 'right' },
    { key: 'newBasePrice', label: 'Base nueva', type: 'money', align: 'right' },
    { key: 'oldFinalPrice', label: 'Final anterior', type: 'money', align: 'right' },
    { key: 'newFinalPrice', label: 'Final nuevo', type: 'money', align: 'right' },
    { key: 'changedByType', label: 'Actor' },
    { key: 'reason', label: 'Motivo' }
  ];
}
