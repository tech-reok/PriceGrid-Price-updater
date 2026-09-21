import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyService } from '../../core/services/catalog.services';
import { TenantService } from '../../core/services/access.services';
import { ToastService } from '../../core/services/toast.service';
import { Currency, Tenant } from '../../core/models';
import { extractApiErrorMessage } from '../../core/utils/format';
import { StatePanelComponent } from '../../shared/state-panel.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { LucideAngularModule } from 'lucide-angular';
import { SessionStore } from '../../core/services/session.store';
import { listTimeZoneOptions } from '../../core/utils/time-zones';

/**
 * Settings: read-only currency catalog (phase 1) plus session/company context.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [StatePanelComponent, StatusBadgeComponent, LucideAngularModule],
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnDestroy, OnInit {
  private readonly currencyService = inject(CurrencyService);
  private readonly tenantService = inject(TenantService);
  private readonly toast = inject(ToastService);
  readonly session = inject(SessionStore);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currencies = signal<Currency[]>([]);
  readonly tenant = signal<Tenant | null>(null);
  readonly selectedTimeZone = signal('UTC');
  readonly timeZoneSearch = signal('');
  readonly timeZoneSaving = signal(false);
  readonly timeZoneOptions = listTimeZoneOptions();
  readonly filteredTimeZoneOptions = computed(() => {
    const query = this.timeZoneSearch().trim().toLowerCase();
    if (!query) return this.timeZoneOptions;
    return this.timeZoneOptions.filter((option) => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query));
  });
  readonly currentBusinessTime = computed(() => {
    try {
      return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: this.selectedTimeZone()
      }).format(this.now());
    } catch {
      return this.now().toLocaleString('es-MX');
    }
  });
  private readonly now = signal(new Date());
  private readonly clock = window.setInterval(() => this.now.set(new Date()), 60_000);

  ngOnInit(): void {
    this.currencyService.list({ limit: 100, sort: 'code', order: 'asc' }).subscribe({
      next: (response) => {
        this.currencies.set(response.data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(extractApiErrorMessage(error));
        this.loading.set(false);
      }
    });

    this.tenantService.me().subscribe({
      next: (tenant) => {
        this.tenant.set(tenant);
        this.selectedTimeZone.set(tenant.timeZone || 'UTC');
      },
      error: (error: unknown) => this.error.set(extractApiErrorMessage(error))
    });
  }

  saveTimeZone(): void {
    const timeZone = this.selectedTimeZone();
    this.timeZoneSaving.set(true);
    this.tenantService.updateTimeZone(timeZone).subscribe({
      next: (response) => {
        this.selectedTimeZone.set(response.timeZone);
        this.tenant.update((current) => current ? { ...current, timeZone: response.timeZone } : current);
        this.timeZoneSaving.set(false);
        this.toast.success('Zona horaria actualizada');
      },
      error: (error: unknown) => {
        this.timeZoneSaving.set(false);
        this.toast.error(extractApiErrorMessage(error));
      }
    });
  }

  ngOnDestroy(): void {
    window.clearInterval(this.clock);
  }
}
