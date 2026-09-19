import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionStore } from '../services/session.store';

/**
 * Attaches the in-memory access token and, for a global administrator, the
 * `X-Tenant-Id` header selecting the active company.
 * `withCredentials` lets the HttpOnly refresh cookie travel with the request.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);

  const headers: Record<string, string> = {};
  const token = session.accessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const tenantId = session.activeTenantId();
  if (session.isGlobalAdmin() && tenantId) headers['X-Tenant-Id'] = tenantId;

  return next(req.clone({ setHeaders: headers, withCredentials: true }));
};
