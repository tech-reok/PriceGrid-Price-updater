import { Injectable, computed, signal } from '@angular/core';
import type { AuthUser } from '../models';

/**
 * Holds the session **in memory**: the access token is never persisted and the
 * refresh token lives in an HttpOnly cookie owned by the API.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly tenantSignal = signal<string | null>(null);

  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly activeTenantId = this.tenantSignal.asReadonly();

  readonly isAuthenticated = computed(() => this.accessTokenSignal() !== null);
  readonly isGlobalAdmin = computed(() => this.userSignal()?.isGlobalAdmin === true);
  readonly permissions = computed(() => this.userSignal()?.permissions ?? []);
  readonly tenantId = computed(() => this.userSignal()?.tenantId ?? null);

  setSession(accessToken: string, user: AuthUser): void {
    this.accessTokenSignal.set(accessToken);
    this.userSignal.set(user);
    // A non-global user always operates on their own company.
    this.tenantSignal.set(user.isGlobalAdmin ? this.tenantSignal() : user.tenantId);
  }

  patchUser(user: AuthUser): void {
    this.userSignal.set(user);
  }

  selectTenant(tenantId: string | null): void {
    this.tenantSignal.set(tenantId);
  }

  clear(): void {
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
    this.tenantSignal.set(null);
  }

  hasPermission(permission: string): boolean {
    const user = this.userSignal();
    if (!user) return false;
    return user.isGlobalAdmin || user.permissions.includes(permission);
  }
}
