import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { ModalComponent } from '../../shared/modal.component';
import { CurrencyService, MarketplaceService, PriceListService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { ToastService } from '../../core/services/toast.service';
import { currencyOptionLoader, staticOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig, PayloadMapper, RowAction } from '../../shared/crud-page.types';
import type { Marketplace, PriceList } from '../../core/models';

@Component({
  selector: 'app-price-lists',
  standalone: true,
  imports: [CommonModule, CrudPageComponent, ModalComponent],
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
      [rowActions]="rowActions"
    />
    <app-modal
      [open]="marketplacesOpen()"
      title="Marketplaces de la lista"
      subtitle="Selecciona los marketplaces donde esta lista estará disponible."
      (closed)="closeMarketplaces()"
    >
      @if (marketplacesOpen()) {
        <div class="space-y-4">
          <p class="text-sm text-olive">Lista: <span class="font-medium text-forest">{{ selectedPriceList()?.name }}</span></p>
          <div class="max-h-72 space-y-2 overflow-y-auto rounded-md border border-line p-3">
            @for (marketplace of availableMarketplaces(); track marketplace.id) {
              <label class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-forest hover:bg-sidebar">
                <input type="checkbox" [checked]="selectedMarketplaceIds().has(marketplace.id)" (change)="toggleMarketplace(marketplace.id)" />
                <span>{{ marketplace.name }}</span>
              </label>
            } @empty { <p class="text-sm text-olive">No hay marketplaces activos disponibles.</p> }
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="rounded-md border border-line px-4 py-2 text-sm text-forest" (click)="closeMarketplaces()">Cancelar</button>
            <button type="button" class="rounded-md bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" [disabled]="marketplacesSaving()" (click)="saveMarketplaces()">{{ marketplacesSaving() ? 'Guardando…' : 'Guardar marketplaces' }}</button>
          </div>
        </div>
      }
    </app-modal>
  `
})
export class PriceListsComponent {
  readonly service = inject(PriceListService);
  private readonly currencyService = inject(CurrencyService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);

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

  readonly marketplacesOpen = signal(false);
  readonly marketplacesSaving = signal(false);
  readonly selectedPriceList = signal<PriceList | null>(null);
  readonly availableMarketplaces = signal<Marketplace[]>([]);
  readonly selectedMarketplaceIds = signal<Set<string>>(new Set());

  readonly rowActions: RowAction[] = [
    {
      label: 'Marketplaces',
      visible: () => this.can('price-lists:update'),
      run: (row) => this.openMarketplaces(row)
    }
  ];

  /** The optional currency select sends '' when unset; the API expects null. */
  readonly mapToPayload: PayloadMapper = (values) => ({
    ...values,
    currencyCode: values['currencyCode'] ? values['currencyCode'] : null
  });

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  openMarketplaces(priceList: PriceList): void {
    this.selectedPriceList.set(priceList);
    this.marketplacesOpen.set(true);
    this.selectedMarketplaceIds.set(new Set(priceList.priceListMarketplaces?.map((row) => row.marketplace.id) ?? []));

    this.marketplaceService.list({ limit: 100, status: 'active', sort: 'name', order: 'asc' }).subscribe({
      next: (response) => this.availableMarketplaces.set(response.data),
      error: () => this.availableMarketplaces.set([])
    });
    this.service.get(priceList.id).subscribe({
      next: (current) => this.selectedMarketplaceIds.set(new Set(current.priceListMarketplaces?.map((row) => row.marketplace.id) ?? [])),
      error: (error) => this.toast.error(error?.error?.message ?? 'No se pudieron cargar los marketplaces de la lista')
    });
  }

  toggleMarketplace(id: string): void {
    const next = new Set(this.selectedMarketplaceIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedMarketplaceIds.set(next);
  }

  saveMarketplaces(): void {
    const priceList = this.selectedPriceList();
    if (!priceList) return;
    this.marketplacesSaving.set(true);
    this.service.setMarketplaces(priceList.id, [...this.selectedMarketplaceIds()]).subscribe({
      next: () => {
        this.marketplacesSaving.set(false);
        this.marketplacesOpen.set(false);
        this.toast.success('Marketplaces actualizados');
      },
      error: (error) => {
        this.marketplacesSaving.set(false);
        this.toast.error(error?.error?.message ?? 'No se pudieron guardar los marketplaces');
      }
    });
  }

  closeMarketplaces(): void {
    this.marketplacesOpen.set(false);
    this.selectedPriceList.set(null);
    this.availableMarketplaces.set([]);
  }
}
