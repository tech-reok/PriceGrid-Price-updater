import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer } from '../../src/di/container';
import { hashPassword } from '../../src/common/utils/password';
import { hashApiKey } from '../../src/common/utils/api-key';
import { createFakePrisma } from '../helpers/fake-prisma';

const TENANT = '11111111-1111-4111-8111-111111111111';

async function buildApp() {
  const prisma = createFakePrisma({
    currency: [{ id: 'c1', code: 'MXN', name: 'Peso', symbol: '$', decimals: 2, status: 'active', deletedAt: null }],
    permission: [{ id: 'perm-read', slug: 'products:read', name: 'View products', deletedAt: null }],
    role: [
      {
        id: 'role-1',
        tenantId: null,
        slug: 'tenant_admin',
        name: 'Tenant admin',
        isSystem: true,
        status: 'active',
        deletedAt: null
      }
    ],
    rolePermission: [{ roleId: 'role-1', permissionId: 'perm-read' }],
    user: [
      {
        id: 'user-1',
        tenantId: TENANT,
        name: 'Admin',
        email: 'admin@example.com',
        passwordHash: await hashPassword('Password!123'),
        roleId: 'role-1',
        status: 'active',
        deletedAt: null
      }
    ],
    apiKey: [
      {
        id: 'key-1',
        tenantId: TENANT,
        name: 'External key',
        keyHash: hashApiKey('pg_external_secret'),
        prefix: 'pg_external',
        scopes: ['products:read'],
        status: 'active',
        expiresAt: null,
        revokedAt: null,
        deletedAt: null
      }
    ],
    product: [
      {
        id: 'prod-1',
        tenantId: TENANT,
        sku: 'SKU-1',
        name: 'Product',
        basePrice: 100,
        currencyCode: 'MXN',
        status: 'active',
        deletedAt: null,
        createdAt: new Date('2024-01-01')
      }
    ]
  });

  buildContainer(prisma);
  return { app: createApp(prisma), prisma };
}

describe('Express application wiring', () => {
  it('exposes the health check at /health and /api/v1/health', async () => {
    const { app } = await buildApp();

    const root = await request(app).get('/health');
    expect(root.status).toBe(200);
    expect(root.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof root.body.uptime).toBe('number');
    expect(typeof root.body.version).toBe('string');

    const versioned = await request(app).get('/api/v1/health');
    expect(versioned.status).toBe(200);
  });

  it('reports a degraded database state', async () => {
    const { app, prisma } = await buildApp();
    prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('connection refused'));

    const response = await request(app).get('/health');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('returns the standard 404 envelope for unknown routes', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    expect(response.body.traceId).toBeTruthy();
  });

  it('echoes a correlation id on every response', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/health').set('x-request-id', 'trace-abc');
    expect(response.headers['x-request-id']).toBe('trace-abc');
  });

  it('rejects malformed JSON with a 400 envelope', async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_JSON');
  });

  it('validates login input', async () => {
    const { app } = await buildApp();

    const response = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid credentials with a generic error', async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in, sets an HttpOnly refresh cookie and authenticates subsequent requests', async () => {
    const { app } = await buildApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user).toMatchObject({ email: 'admin@example.com', roleSlug: 'tenant_admin' });

    const cookie = login.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('pg_refresh_token=');
    expect(cookie.toLowerCase()).toContain('httponly');

    const accessToken = login.body.accessToken as string;
    const me = await request(app).get('/api/v1/auth/me').set('authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: 'user-1' });

    const products = await request(app)
      .get('/api/v1/products')
      .set('authorization', `Bearer ${accessToken}`);
    expect(products.status).toBe(200);
    expect(products.body.data).toHaveLength(1);
  });

  it('refreshes using the refresh cookie', async () => {
    const { app } = await buildApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', login.headers['set-cookie']);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // The refresh token rotates even when the access token payload is identical.
    expect(refreshed.headers['set-cookie']?.[0]).not.toBe(login.headers['set-cookie']?.[0]);
  });

  it('logs out and clears the refresh cookie', async () => {
    const { app } = await buildApp();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password!123' });

    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', login.headers['set-cookie']);
    expect(logout.status).toBe(204);

    const afterLogout = await request(app).post('/api/v1/auth/refresh').set('Cookie', login.headers['set-cookie']);
    expect(afterLogout.status).toBe(401);
  });

  it('requires authentication on the admin API', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/api/v1/products');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('serves the external read-only API with an API key and enforces scopes', async () => {
    const { app } = await buildApp();

    const withoutKey = await request(app).get('/api/v1/external/products');
    expect(withoutKey.status).toBe(401);
    expect(withoutKey.body.code).toBe('API_KEY_REQUIRED');

    const withKey = await request(app).get('/api/v1/external/products').set('x-api-key', 'pg_external_secret');
    expect(withKey.status).toBe(200);
    expect(withKey.body.data).toHaveLength(1);

    // The key only holds products:read.
    const forbidden = await request(app).get('/api/v1/external/prices').set('x-api-key', 'pg_external_secret');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('does not expose write verbs on the external API', async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post('/api/v1/external/products')
      .set('x-api-key', 'pg_external_secret');

    expect(response.status).toBe(404);
  });

  it('rejects an unknown API key', async () => {
    const { app } = await buildApp();

    const response = await request(app).get('/api/v1/external/products').set('x-api-key', 'pg_wrong');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_API_KEY');
  });
});
