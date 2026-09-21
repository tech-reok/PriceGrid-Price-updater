import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { globalAdminGuard, permissionGuard } from './core/guards/permission.guard';
import { tenantGuard } from './core/guards/tenant.guard';
import { ShellComponent } from './layout/shell.component';

/**
 * Application routes.
 *
 * Feature screens are lazily loaded so the heavy dashboard dependencies
 * (ngx-charts / d3) stay out of the initial bundle. Every dashboard module sits
 * behind the auth guard, its permission slug and — for tenant-scoped modules —
 * the tenant guard.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent)
  },

  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      {
        path: 'dashboard',
        canActivate: [tenantGuard, permissionGuard('dashboard:read')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },

      {
        path: 'price-catalog',
        canActivate: [tenantGuard, permissionGuard('price-catalog:read')],
        loadComponent: () =>
          import('./features/price-catalog/price-catalog.component').then((m) => m.PriceCatalogComponent)
      },

      // Global-admin only
      {
        path: 'companies',
        canActivate: [globalAdminGuard],
        loadComponent: () =>
          import('./features/companies/companies.component').then((m) => m.CompaniesComponent)
      },

      // Tenant-scoped modules
      {
        path: 'products',
        canActivate: [tenantGuard, permissionGuard('products:read')],
        loadComponent: () =>
          import('./features/products/products.component').then((m) => m.ProductsComponent)
      },
      {
        path: 'price-lists',
        canActivate: [tenantGuard, permissionGuard('price-lists:read')],
        loadComponent: () =>
          import('./features/price-lists/price-lists.component').then((m) => m.PriceListsComponent)
      },
      {
        path: 'marketplaces',
        canActivate: [tenantGuard, permissionGuard('marketplaces:read')],
        loadComponent: () =>
          import('./features/marketplaces/marketplaces.component').then((m) => m.MarketplacesComponent)
      },
      {
        path: 'prices',
        canActivate: [tenantGuard, permissionGuard('prices:read')],
        loadComponent: () => import('./features/prices/prices.component').then((m) => m.PricesComponent)
      },
      {
        path: 'discounts',
        canActivate: [tenantGuard, permissionGuard('discounts:read')],
        loadComponent: () =>
          import('./features/discounts/discounts.component').then((m) => m.DiscountsComponent)
      },
      {
        path: 'price-history',
        canActivate: [tenantGuard, permissionGuard('price-history:read')],
        loadComponent: () =>
          import('./features/price-history/price-history.component').then((m) => m.PriceHistoryComponent)
      },
      {
        path: 'api-keys',
        canActivate: [tenantGuard, permissionGuard('api-keys:read')],
        loadComponent: () =>
          import('./features/api-keys/api-keys.component').then((m) => m.ApiKeysComponent)
      },
      {
        path: 'users',
        canActivate: [tenantGuard, permissionGuard('users:read')],
        loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent)
      },
      {
        path: 'roles',
        canActivate: [tenantGuard, permissionGuard('roles:read')],
        loadComponent: () => import('./features/roles/roles.component').then((m) => m.RolesComponent)
      },

      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent)
      },

      { path: '**', redirectTo: 'dashboard' }
    ]
  },

  { path: '**', redirectTo: 'dashboard' }
];
