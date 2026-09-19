import { inject, injectable } from 'tsyringe';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { TOKENS } from '../di/tokens';
import { UnauthorizedError } from '../common/errors';
import { verifyPassword } from '../common/utils/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry
} from '../common/utils/tokens';
import { logger } from '../common/logger';
import type { IAuthRepository, UserWithRole } from '../repositories/auth.repository';
import type { AuthUser } from '../types';

export const GLOBAL_ADMIN_ROLE = 'global_admin';

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

export interface AccessTokenPayload {
  sub: string;
  tenantId: string | null;
  role: string;
}

@injectable()
export class AuthService {
  constructor(@inject(TOKENS.AuthRepository) private readonly repository: IAuthRepository) {}

  private signAccessToken(user: UserWithRole): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role.slug
    };
    return jwt.sign(payload, env.jwt.accessSecret, {
      expiresIn: env.jwt.accessTtl as SignOptions['expiresIn']
    });
  }

  private async toAuthUser(user: UserWithRole): Promise<AuthUser> {
    const permissions = await this.repository.findPermissionsByRoleId(user.roleId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleSlug: user.role.slug,
      tenantId: user.tenantId,
      isGlobalAdmin: user.role.slug === GLOBAL_ADMIN_ROLE,
      permissions
    };
  }

  private async issueSession(user: UserWithRole, meta: SessionMeta = {}): Promise<SessionResult> {
    const accessToken = this.signAccessToken(user);
    const refreshToken = generateRefreshToken();
    const expiresAt = refreshTokenExpiry();

    await this.repository.createRefreshToken({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null
    });

    return { accessToken, refreshToken, refreshExpiresAt: expiresAt, user: await this.toAuthUser(user) };
  }

  async login(email: string, password: string, meta: SessionMeta = {}): Promise<SessionResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(normalizedEmail);

    // Same error for unknown user and wrong password (no user enumeration).
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    await this.repository.touchLastLogin(user.id);
    logger.info({ userId: user.id, tenantId: user.tenantId }, 'auth_login_success');

    return this.issueSession(user, meta);
  }

  /**
   * Rotates the refresh token. Presenting an already-revoked token is treated
   * as reuse and invalidates every active token for that user.
   */
  async refresh(rawToken: string, meta: SessionMeta = {}): Promise<SessionResult> {
    const tokenHash = hashRefreshToken(rawToken);
    const stored = await this.repository.findRefreshTokenByHash(tokenHash);

    if (!stored) {
      throw new UnauthorizedError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    if (stored.revokedAt) {
      await this.repository.revokeAllUserRefreshTokens(stored.userId);
      logger.warn({ userId: stored.userId }, 'auth_refresh_reuse_detected');
      throw new UnauthorizedError('Refresh token has been revoked', 'REFRESH_TOKEN_REUSED');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    }

    const user = await this.repository.findUserById(stored.userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User is not active', 'USER_INACTIVE');
    }

    const session = await this.issueSession(user, meta);
    const created = await this.repository.findRefreshTokenByHash(hashRefreshToken(session.refreshToken));
    await this.repository.revokeRefreshToken(stored.id, created?.id ?? null);

    return session;
  }

  async logout(rawToken: string | null | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.repository.findRefreshTokenByHash(hashRefreshToken(rawToken));
    if (stored && !stored.revokedAt) {
      await this.repository.revokeRefreshToken(stored.id);
    }
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User is not active', 'USER_INACTIVE');
    }
    return this.toAuthUser(user);
  }

  /** Used by the JWT middleware to validate access tokens. */
  async verifyAccessToken(token: string): Promise<AuthUser> {
    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired access token', 'INVALID_ACCESS_TOKEN');
    }

    const user = await this.repository.findUserById(payload.sub);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User is not active', 'USER_INACTIVE');
    }

    return this.toAuthUser(user);
  }
}
