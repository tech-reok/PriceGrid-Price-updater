import jwt from 'jsonwebtoken';
import { AuthService, GLOBAL_ADMIN_ROLE } from '../../src/services/auth.service';
import { UnauthorizedError } from '../../src/common/errors';
import { hashPassword } from '../../src/common/utils/password';
import { hashRefreshToken } from '../../src/common/utils/tokens';
import { env } from '../../src/config/env';
import type { IAuthRepository, UserWithRole } from '../../src/repositories/auth.repository';

interface TokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

function createRepository(userRow: UserWithRole | null): { repository: IAuthRepository; tokens: TokenRow[]; mocks: any } {
  const tokens: TokenRow[] = [];

  const repository: any = {
    findUserByEmail: jest.fn().mockResolvedValue(userRow),
    findUserById: jest.fn().mockResolvedValue(userRow),
    findPermissionsByRoleId: jest.fn().mockResolvedValue(['products:read', 'prices:read']),
    touchLastLogin: jest.fn().mockResolvedValue(undefined),
    createRefreshToken: jest.fn(async (input: any) => {
      const row: TokenRow = {
        id: `rt-${tokens.length + 1}`,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        replacedById: null
      };
      tokens.push(row);
      return row;
    }),
    findRefreshTokenByHash: jest.fn(async (hash: string) => tokens.find((row) => row.tokenHash === hash) ?? null),
    revokeRefreshToken: jest.fn(async (id: string, replacedById?: string | null) => {
      const row = tokens.find((token) => token.id === id);
      if (row) {
        row.revokedAt = new Date();
        row.replacedById = replacedById ?? null;
      }
    }),
    revokeAllUserRefreshTokens: jest.fn().mockResolvedValue(2)
  };

  return { repository, tokens, mocks: repository };
}

async function buildUser(overrides: Partial<UserWithRole> = {}): Promise<UserWithRole> {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: await hashPassword('secret-password'),
    roleId: 'role-1',
    status: 'active',
    deletedAt: null,
    role: { id: 'role-1', slug: 'tenant_admin', name: 'Tenant admin', isSystem: true, status: 'active' },
    ...overrides
  };
}

describe('AuthService.login', () => {
  it('issues an access token, a refresh token and the user context', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('Admin@Example.com', 'secret-password');

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user).toMatchObject({
      id: 'user-1',
      email: 'admin@example.com',
      roleSlug: 'tenant_admin',
      tenantId: 'tenant-1',
      isGlobalAdmin: false
    });
    expect(session.user.permissions).toEqual(['products:read', 'prices:read']);

    // Email is normalized before lookup.
    expect(repository.findUserByEmail).toHaveBeenCalledWith('admin@example.com');
  });

  it('embeds sub/tenantId/role in the access token', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    const payload = jwt.verify(session.accessToken, env.jwt.accessSecret) as any;

    expect(payload.sub).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.role).toBe('tenant_admin');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('flags the global admin role and its null tenant', async () => {
    const userRow = await buildUser({
      tenantId: null,
      role: { id: 'role-g', slug: GLOBAL_ADMIN_ROLE, name: 'Global', isSystem: true, status: 'active' }
    });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    expect(session.user.isGlobalAdmin).toBe(true);
    expect(session.user.tenantId).toBeNull();
  });

  it('stores only the refresh token hash', async () => {
    const userRow = await buildUser();
    const { repository, tokens } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');

    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(tokens[0].tokenHash).not.toBe(session.refreshToken);
  });

  it('updates last_login_at', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    await service.login('admin@example.com', 'secret-password');
    expect(mocks.touchLastLogin).toHaveBeenCalledWith('user-1');
  });

  it('rejects unknown users with the same generic error', async () => {
    const { repository } = createRepository(null);
    const service = new AuthService(repository);

    await expect(service.login('nobody@example.com', 'x')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    });
  });

  it('rejects a wrong password', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.login('admin@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an inactive user', async () => {
    const userRow = await buildUser({ status: 'inactive' });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.login('admin@example.com', 'secret-password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    });
  });
});

describe('AuthService.refresh', () => {
  it('rotates the refresh token and revokes the previous one', async () => {
    const userRow = await buildUser();
    const { repository, tokens, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    const second = await service.refresh(first.refreshToken);

    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].revokedAt).toBeInstanceOf(Date);
    expect(tokens[0].replacedById).toBe(tokens[1].id);
    expect(mocks.revokeRefreshToken).toHaveBeenCalled();
  });

  it('rejects an unknown refresh token', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.refresh('not-a-real-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN'
    });
  });

  it('detects reuse of a revoked token and invalidates the family', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    await service.refresh(first.refreshToken);

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED'
    });
    expect(mocks.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-1');
  });

  it('rejects an expired refresh token', async () => {
    const userRow = await buildUser();
    const { repository, tokens } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    tokens[0].expiresAt = new Date('2000-01-01');

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_EXPIRED'
    });
  });

  it('rejects when the user is no longer active', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const first = await service.login('admin@example.com', 'secret-password');
    mocks.findUserById.mockResolvedValue(await buildUser({ status: 'inactive' }));

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });
});

describe('AuthService.logout', () => {
  it('revokes the presented refresh token', async () => {
    const userRow = await buildUser();
    const { repository, tokens, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    await service.logout(session.refreshToken);

    expect(tokens[0].revokedAt).toBeInstanceOf(Date);
    expect(mocks.revokeRefreshToken).toHaveBeenCalled();
  });

  it('is a no-op without a token', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    await service.logout(null);
    await service.logout(undefined);
    expect(mocks.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown token', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    await service.logout('unknown');
    expect(mocks.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('does not revoke twice', async () => {
    const userRow = await buildUser();
    const { repository, mocks } = createRepository(userRow);
    const service = new AuthService(repository);

    const session = await service.login('admin@example.com', 'secret-password');
    await service.logout(session.refreshToken);
    mocks.revokeRefreshToken.mockClear();
    await service.logout(session.refreshToken);
    expect(mocks.revokeRefreshToken).not.toHaveBeenCalled();
  });
});

describe('AuthService.me', () => {
  it('returns the user context', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.me('user-1')).resolves.toMatchObject({ id: 'user-1', roleSlug: 'tenant_admin' });
  });

  it('rejects an inactive user', async () => {
    const userRow = await buildUser({ status: 'inactive' });
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.me('user-1')).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });
});

describe('AuthService.verifyAccessToken', () => {
  it('validates a token signed with the access secret', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    const token = jwt.sign({ sub: 'user-1', tenantId: 'tenant-1', role: 'tenant_admin' }, env.jwt.accessSecret, {
      expiresIn: '5m'
    });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({ id: 'user-1' });
  });

  it('rejects a malformed or foreign token', async () => {
    const userRow = await buildUser();
    const { repository } = createRepository(userRow);
    const service = new AuthService(repository);

    await expect(service.verifyAccessToken('garbage')).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN'
    });

    const foreign = jwt.sign({ sub: 'user-1' }, 'another-secret');
    await expect(service.verifyAccessToken(foreign)).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN'
    });
  });

  it('rejects when the user no longer exists', async () => {
    const { repository } = createRepository(null);
    const service = new AuthService(repository);
    const token = jwt.sign({ sub: 'ghost', tenantId: null, role: 'tenant_user' }, env.jwt.accessSecret, {
      expiresIn: '5m'
    });

    await expect(service.verifyAccessToken(token)).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });
});
