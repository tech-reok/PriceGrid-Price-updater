import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authGuard, guestGuard } from './auth.guard';
import { globalAdminGuard, permissionGuard } from './permission.guard';
import { tenantGuard } from './tenant.guard';
import { SessionStore } from '../services/session.store';
import type { AuthUser } from '../models';

function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleId: 'role-1',
    roleSlug: 'tenant_admin',
    tenantId: 'tenant-1',
    isGlobalAdmin: false,
    permissions: ['products:read'],
    ...overrides
  };
}

async function runGuard(guard: CanActivateFn): Promise<boolean | UrlTree> {
  const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));
  if (result instanceof Observable || result instanceof Promise) {
    return firstValueFrom(result as Observable<boolean | UrlTree>);
  }
  return result as boolean | UrlTree;
}

describe('authGuard', () => {
  let http: HttpTestingController;
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('allows an authenticated user', async () => {
    session.setSession('token-1', authUser());
    expect(await runGuard(authGuard)).toBe(true);
    http.verify();
  });

  it('silently restores the session from the refresh cookie', async () => {
    const result = runGuard(authGuard);

    http.expectOne(`${environment.apiUrl}/auth/refresh`).flush({ accessToken: 'token-2', user: authUser() });

    expect(await result).toBe(true);
    expect(session.isAuthenticated()).toBe(true);
  });

  it('redirects to the login page when the refresh fails', async () => {
    const result = runGuard(authGuard);

    http
      .expectOne(`${environment.apiUrl}/auth/refresh`)
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    const outcome = await result;
    expect(outcome).toBeInstanceOf(UrlTree);
    expect(String(outcome)).toContain('/login');
  });
});

describe('guestGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('lets anonymous users reach the login page', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any)) as boolean | UrlTree;
    expect(result).toBe(true);
  });

  it('sends authenticated users to the dashboard', () => {
    session.setSession('token-1', authUser());
    const result = TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/dashboard');
  });
});

describe('permissionGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('allows a user holding the permission', () => {
    session.setSession('token-1', authUser({ permissions: ['products:read'] }));
    const result = TestBed.runInInjectionContext(() =>
      permissionGuard('products:read')({} as any, {} as any)
    ) as boolean | UrlTree;

    expect(result).toBe(true);
  });

  it('redirects a user without the permission', () => {
    session.setSession('token-1', authUser({ permissions: [] }));
    const result = TestBed.runInInjectionContext(() =>
      permissionGuard('products:delete')({} as any, {} as any)
    ) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/dashboard');
  });

  it('always allows the global admin', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, permissions: [] }));
    const result = TestBed.runInInjectionContext(() =>
      permissionGuard('products:delete')({} as any, {} as any)
    ) as boolean;

    expect(result).toBe(true);
  });
});

describe('globalAdminGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('allows a global admin', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, tenantId: null }));
    const result = TestBed.runInInjectionContext(() => globalAdminGuard({} as any, {} as any)) as boolean;

    expect(result).toBe(true);
  });

  it('redirects a regular user', () => {
    session.setSession('token-1', authUser());
    const result = TestBed.runInInjectionContext(() => globalAdminGuard({} as any, {} as any)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
  });
});

describe('tenantGuard', () => {
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
    session.clear();
  });

  it('allows a non-global user (tenant comes from the JWT)', () => {
    session.setSession('token-1', authUser());
    const result = TestBed.runInInjectionContext(() => tenantGuard({} as any, {} as any)) as boolean;

    expect(result).toBe(true);
  });

  it('requires a global admin to pick a company', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, tenantId: null }));
    const result = TestBed.runInInjectionContext(() => tenantGuard({} as any, {} as any)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toContain('/companies');
  });

  it('allows a global admin with a selected company', () => {
    session.setSession('token-1', authUser({ isGlobalAdmin: true, tenantId: null }));
    session.selectTenant('tenant-42');

    const result = TestBed.runInInjectionContext(() => tenantGuard({} as any, {} as any)) as boolean;
    expect(result).toBe(true);
  });
});
