import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../core/services/auth.service';
import { SessionStore } from '../core/services/session.store';
import { TenantContextService } from '../core/services/tenant-context.service';
import { TenantService } from '../core/services/access.services';
import { ToastHostComponent } from '../shared/toast-host.component';
import type { Tenant } from '../core/models';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  permission: string;
  globalOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideAngularModule,
    ToastHostComponent
  ],
  templateUrl: './shell.component.html'
})
export class ShellComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly tenantService = inject(TenantService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly router = inject(Router);

  readonly session = inject(SessionStore);

  readonly sidebarOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly tenants = signal<Tenant[]>([]);

  /** Sidebar modules, in the order defined by the plan. */
  private readonly allNavItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'layout-dashboard', permission: 'dashboard:read' },
    { label: 'Empresas', path: '/companies', icon: 'building-2', permission: 'tenants:read', globalOnly: true },
    { label: 'Productos', path: '/products', icon: 'package', permission: 'products:read' },
    { label: 'Listas de precios', path: '/price-lists', icon: 'tags', permission: 'price-lists:read' },
    { label: 'Marketplaces', path: '/marketplaces', icon: 'store', permission: 'marketplaces:read' },
    { label: 'Precios', path: '/prices', icon: 'dollar-sign', permission: 'prices:read' },
    { label: 'Descuentos', path: '/discounts', icon: 'percent', permission: 'discounts:read' },
    { label: 'Historial de precios', path: '/price-history', icon: 'history', permission: 'price-history:read' },
    { label: 'API Keys', path: '/api-keys', icon: 'key-round', permission: 'api-keys:read' },
    { label: 'Usuarios', path: '/users', icon: 'users', permission: 'users:read' },
    { label: 'Roles', path: '/roles', icon: 'shield-check', permission: 'roles:read' },
    { label: 'Configuración', path: '/settings', icon: 'settings', permission: 'settings:read' }
  ];

  readonly navItems = computed(() =>
    this.allNavItems.filter((item) => {
      if (item.globalOnly && !this.session.isGlobalAdmin()) return false;
      return this.session.hasPermission(item.permission);
    })
  );

  readonly userName = computed(() => this.session.user()?.name ?? 'Invitado');
  readonly userRole = computed(() => this.session.user()?.roleSlug ?? '');
  readonly initials = computed(() =>
    this.userName()
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
  );
  readonly activeTenantName = computed(() => {
    const id = this.session.activeTenantId();
    if (!id) return 'Selecciona empresa';
    return this.tenants().find((tenant) => tenant.id === id)?.commercialName ?? 'Empresa';
  });

  ngOnInit(): void {
    if (this.session.isGlobalAdmin()) {
      this.loadTenants();
    }
  }

  private loadTenants(): void {
    this.tenantService.list({ limit: 100, sort: 'commercialName', order: 'asc' }).subscribe({
      next: (response) => {
        this.tenants.set(response.data);
        // Auto-select the first company so tenant-scoped screens work immediately.
        if (!this.session.activeTenantId() && response.data.length > 0) {
          this.tenantContext.select(response.data[0].id);
        }
      },
      error: () => this.tenants.set([])
    });
  }

  onTenantChange(value: string): void {
    this.tenantContext.select(value === '' ? null : value);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login'])
    });
  }
}
