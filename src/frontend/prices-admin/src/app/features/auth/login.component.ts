import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { extractApiErrorMessage } from '../../core/utils/format';
import { PriceGridLogoComponent } from '../../shared/pricegrid-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, PriceGridLogoComponent],
  template: `
    <div class="min-h-screen w-full flex items-center justify-center p-6">
      <div class="w-full max-w-md bg-surface rounded-2xl shadow-app border border-line overflow-hidden">
        <div class="bg-header px-8 py-7 border-b border-line">
          <app-pricegrid-logo></app-pricegrid-logo>
          <p class="text-sm text-olive mt-2">Administración de precios multi-marketplace</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="px-8 py-8 space-y-5" data-testid="login-form">
          @if (error()) {
            <div
              class="px-4 py-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-forest"
              data-testid="login-error"
            >
              {{ error() }}
            </div>
          }

          <div>
            <label class="pg-label" for="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              class="pg-input"
              [class.pg-input-invalid]="invalid('email')"
              autocomplete="username"
              placeholder="admin@empresa.com"
            />
            @if (invalid('email')) {
              <p class="text-xs text-danger mt-1">Ingresa un correo válido.</p>
            }
          </div>

          <div>
            <label class="pg-label" for="password">Contraseña</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              class="pg-input"
              [class.pg-input-invalid]="invalid('password')"
              autocomplete="current-password"
              placeholder="••••••••"
            />
            @if (invalid('password')) {
              <p class="text-xs text-danger mt-1">La contraseña es obligatoria.</p>
            }
          </div>

          <button
            type="submit"
            class="w-full px-5 py-2.5 bg-forest text-white rounded-lg text-sm font-medium shadow-sm hover:bg-forest/90 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
            [disabled]="loading()"
            data-testid="login-submit"
          >
            <lucide-icon name="log-in" class="w-4 h-4"></lucide-icon>
            {{ loading() ? 'Ingresando…' : 'Ingresar' }}
          </button>

          <p class="text-xs text-olive text-center leading-relaxed">
            Las credenciales iniciales de desarrollo se generan con los seeds.<br />
            Consulta el README antes de usarlas fuera de un entorno local.
          </p>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  invalid(control: string): boolean {
    const field = this.form.get(control);
    return !!field && field.invalid && (field.touched || field.dirty);
  }

  submit(): void {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);

    this.authService.login(String(email), String(password)).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(extractApiErrorMessage(error));
      }
    });
  }
}
