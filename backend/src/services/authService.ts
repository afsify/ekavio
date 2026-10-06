import bcrypt from 'bcryptjs';
import { classifyIdentifier } from './identityPolicy.js';
import jwt from 'jsonwebtoken';
import { getRuntimeConfig } from '../config/env.js';
import type { MembershipRole } from '../models/Membership.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import { AppError } from '../utils/AppError.js';
import type { Permission } from './authorizationPolicy.js';
import type { EffectiveEntitlements } from './entitlementService.js';
import { getSessionIdFromRefreshCredential, runtimeRefreshSessions } from './sessionService.js';
import type { RefreshSessionManager, SessionMetadata } from './sessionService.js';
import {
  registerAdmin,
  updateOrganizationTheme,
  type RegisterAdminInput,
  type ThemeInput,
} from './accountPersistence.js';

export interface LoginInput {
  phone?: string;
  identifier?: string;
  password: string;
}

export interface IdentityAssignment {
  tenantId: string;
  role: string;
}

export interface IdentityUser {
  id: string;
  tenantId: string;
  role: string;
  name?: string;
  phone: string;
  passwordHash: string;
  assignments: IdentityAssignment[];
  platformOperator?: boolean;
}

export interface BranchContext {
  id: string;
  name: string;
  code: string;
}

export interface MembershipContext {
  id: string;
  organizationId: string;
  tenantId: string;
  orgName?: string;
  role: MembershipRole;
  status: 'active';
  branchIds: string[];
  branches: BranchContext[];
}

export interface PublicUser {
  roleName?: string;
  customRoleId?: string;
  id: string;
  tenantId: string;
  organizationId: string;
  membershipId: string;
  branchId?: string;
  role: MembershipRole;
  permissions: Permission[];
  name?: string;
  phone: string;
  assignments: Array<IdentityAssignment & { orgName?: string }>;
  memberships: MembershipContext[];
}

export interface AuthContext {
  preferences?: { mode: 'light' | 'dark' | 'system'; primaryColor: string };
  userId: string;
  tenantId: string;
  organizationId: string;
  membershipId: string;
  branchId?: string;
  role: MembershipRole;
  permissions: Permission[];
  platformOperator: boolean;
  memberships: MembershipContext[];
  user: PublicUser;
  assignments: PublicUser['assignments'];
  entitlements: EffectiveEntitlements;
  theme: { mode: 'light' | 'dark'; primaryColor: string };
}

export interface AuthResponse extends AuthContext {
  accessToken: string;
}

export interface AuthResult {
  response: AuthResponse;
  refreshCredential: string;
}

export interface AuthContextSelection {
  organizationId?: string;
  branchId?: string;
}

export interface IdentityRepository {
  findByEmail?(email: string): Promise<IdentityUser[]>;
  findByPhone(phone: string): Promise<IdentityUser[]>;
  findById(userId: string): Promise<IdentityUser | null>;
  buildContext(user: IdentityUser, selection?: AuthContextSelection): Promise<AuthContext>;
}

export interface AuthService {
  login(data: LoginInput, metadata?: SessionMetadata): Promise<AuthResult>;
  refresh(
    refreshCredential: string,
    selection?: AuthContextSelection,
  ): Promise<AuthResult>;
  logout(refreshCredential: string | undefined): Promise<string | undefined>;
  revokeUserSessions(userId: string): Promise<void>;
}

export interface AuthServiceDependencies {
  identities: IdentityRepository;
  sessions: RefreshSessionManager;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  signAccessToken: (context: AuthContext, sessionId: string) => string;
  prepareAuthorization?: (userId: string) => Promise<void>;
}

export const normalizeLoginPhone = (phone: string): string => phone.trim();

const runtimeDependencies: AuthServiceDependencies = {
  identities: runtimePersistence.identities,
  sessions: runtimeRefreshSessions,
  verifyPassword: bcrypt.compare,
  signAccessToken: (context, sessionId) =>
    jwt.sign(
      {
        id: context.userId,
        tenantId: context.organizationId,
        role: context.role,
        sessionId,
      },
      getRuntimeConfig().jwtSecret,
      { expiresIn: '15m' },
    ),
};

export const createAuthService = ({
  identities,
  sessions,
  verifyPassword,
  signAccessToken,
  prepareAuthorization = async () => undefined,
}: AuthServiceDependencies): AuthService => ({
  async login(data, metadata) {
    const identifier = classifyIdentifier(data.identifier ?? data.phone ?? '');
    const matches = identifier.kind === 'email'
      ? await identities.findByEmail?.(identifier.value) ?? []
      : await identities.findByPhone(identifier.value);
    if (matches.length === 0) throw new AppError('Invalid credentials', 401);
    if (matches.length > 1) {
      throw new AppError(
        'Multiple accounts use this phone number. Account migration is required before sign-in.',
        409,
      );
    }

    const user = matches[0];
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw new AppError('Invalid credentials', 401);
    }

    await prepareAuthorization(user.id);
    const context = await identities.buildContext(user);
    const session = await sessions.create(user.id, metadata, user.passwordHash);
    return {
      refreshCredential: session.refreshCredential,
      response: {
        accessToken: signAccessToken(context, session.sessionId),
        ...context,
      },
    };
  },

  async refresh(refreshCredential, selection) {
    const session = await sessions.rotate(refreshCredential);
    const user = await identities.findById(session.userId);
    if (!user) {
      await sessions.revoke(session.refreshCredential);
      throw new AppError('Invalid refresh session', 401);
    }

    await prepareAuthorization(user.id);
    const context = await identities.buildContext(user, selection);
    return {
      refreshCredential: session.refreshCredential,
      response: {
        accessToken: signAccessToken(context, session.sessionId),
        ...context,
      },
    };
  },

  async logout(refreshCredential) {
    const sessionId = getSessionIdFromRefreshCredential(refreshCredential);
    await sessions.revoke(refreshCredential);
    return sessionId;
  },

  async revokeUserSessions(userId) {
    await sessions.revokeAllForUser(userId);
  },
});

export const authService = createAuthService(runtimeDependencies);

export const registerAdminService = (data: RegisterAdminInput) =>
  registerAdmin(runtimePersistence.accounts, data);

export const updateThemeService = (organizationId: string, data: ThemeInput) =>
  updateOrganizationTheme(runtimePersistence.accounts, organizationId, data);
