import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyService } from '../../core/services/catalog.services';
import { Currency } from '../../core/models';
import { extractApiErrorMessage } from '../../core/utils/format';
import { StatePanelComponent } from '../../shared/state-panel.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { LucideAngularModule } from 'lucide-angular';
import { SessionStore } from '../../core/services/session.store';

/**
 * Settings: read-only currency catalog (phase 1) plus session/company context.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [StatePanelComponent, StatusBadgeComponent, LucideAngularModule],
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnInit {
  private readonly currencyService = inject(CurrencyService);
  readonly session = inject(SessionStore);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currencies = signal<Currency[]>([]);

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
  }
}
