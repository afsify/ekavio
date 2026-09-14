import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getRuntimeConfig } from '../config/env.js';
import { Branch } from '../models/Branch.js';
import { Membership, type MembershipRole } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { permissionsForRole, type Permission } from './authorizationPolicy.js';
import { ensureLegacyAuthorizationForUser } from './authorizationBackfillService.js';
import { entitlementService, type EffectiveEntitlements } from './entitlementService.js';
import { getSessionIdFromRefreshCredential, runtimeRefreshSessions } from './sessionService.js';
import type { RefreshSessionManager, SessionMetadata } from './sessionService.js';

interface RegisterAdminInput {
  orgName: string;
  orgType: string;
  userName: string;
  phone: string;
  password: string;
}

export interface LoginInput {
  phone: string;
  password: string;
}

interface ThemeInput {
  mode?: 'light' | 'dark';
  primaryColor?: string;
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

const toIdentityUser = (user: InstanceType<typeof User>): IdentityUser => ({
  id: String(user._id),
  tenantId: String(user.tenantId),
  role: user.role ?? 'staff',
  ...(user.name ? { name: user.name } : {}),
  phone: user.phone,
  passwordHash: user.password ?? '',
  assignments: (user.assignments ?? []).map((assignment) => ({
    tenantId: String(assignment.tenantId),
    role: assignment.role,
  })),
  platformOperator: user.platformRole === 'operator',
});

export const mongooseIdentityRepository: IdentityRepository = {
  async findByPhone(phone) {
    const users = await User.find({ phone }).select('+platformRole').limit(2);
    return users.map(toIdentityUser);
  },

  async findById(userId) {
    const user = await User.findById(userId).select('+platformRole');
    return user ? toIdentityUser(user) : null;
  },

  async buildContext(user, selection = {}) {
    const membershipDocuments = await Membership.find({
      userId: user.id,
      status: 'active',
    }).lean();

    if (membershipDocuments.length === 0) {
      throw new AppError('No active organization membership', 403);
    }

    const organizationIds = membershipDocuments.map((membership) =>
      String(membership.organizationId),
    );
    const organizations = await Organization.find({ _id: { $in: organizationIds } }).lean();
    const organizationById = new Map(
      organizations.map((organization) => [String(organization._id), organization]),
    );
    const branchIds = membershipDocuments.flatMap((membership) =>
      membership.branchIds.map(String),
    );
    const branches = await Branch.find({
      _id: { $in: branchIds },
      organizationId: { $in: organizationIds },
      status: 'active',
    }).lean();
    const branchById = new Map(branches.map((branch) => [String(branch._id), branch]));

    const memberships: MembershipContext[] = membershipDocuments.flatMap((membership) => {
      const organizationId = String(membership.organizationId);
      const organization = organizationById.get(organizationId);
      if (!organization) return [];
      const availableBranches = membership.branchIds.flatMap((branchId) => {
        const branch = branchById.get(String(branchId));
        if (!branch || String(branch.organizationId) !== organizationId) return [];
        return [{ id: String(branch._id), name: branch.name, code: branch.code }];
      });
      return [{
        id: String(membership._id),
        organizationId,
        tenantId: organizationId,
        ...(organization.name ? { orgName: organization.name } : {}),
        role: membership.role,
        status: 'active' as const,
        branchIds: availableBranches.map((branch) => branch.id),
        branches: availableBranches,
      }];
    });

    const requestedOrganizationId = selection.organizationId ?? user.tenantId;
    const activeMembership = memberships.find(
      (membership) => membership.organizationId === requestedOrganizationId,
    );
    if (!activeMembership) {
      throw new AppError('Access denied to this organization', 403);
    }

    let branchId = selection.branchId;
    if (branchId && !activeMembership.branchIds.includes(branchId)) {
      throw new AppError('Access denied to this branch', 403);
    }
    branchId ??= activeMembership.branchIds[0];

    const primaryOrganization = organizationById.get(activeMembership.organizationId);
    const permissions = permissionsForRole(activeMembership.role);
    const entitlements = await entitlementService.getEffective(activeMembership.organizationId);
    const assignments = memberships
      .filter((membership) => membership.organizationId !== activeMembership.organizationId)
      .map((membership) => ({
        tenantId: membership.organizationId,
        role: membership.role,
        ...(membership.orgName ? { orgName: membership.orgName } : {}),
      }));
    const theme = primaryOrganization?.theme
      ? {
          mode: primaryOrganization.theme.mode,
          primaryColor: primaryOrganization.theme.primaryColor,
        }
      : { mode: 'light' as const, primaryColor: '#4F46E5' };
    const publicUser: PublicUser = {
      id: user.id,
      tenantId: activeMembership.organizationId,
      organizationId: activeMembership.organizationId,
      membershipId: activeMembership.id,
      ...(branchId ? { branchId } : {}),
      role: activeMembership.role,
      permissions,
      ...(user.name ? { name: user.name } : {}),
      phone: user.phone,
      assignments,
      memberships,
    };

    return {
      userId: user.id,
      tenantId: activeMembership.organizationId,
      organizationId: activeMembership.organizationId,
      membershipId: activeMembership.id,
      ...(branchId ? { branchId } : {}),
      role: activeMembership.role,
      permissions,
      platformOperator: user.platformOperator === true,
      memberships,
      user: publicUser,
      assignments,
      entitlements,
      theme,
    };
  },
};

const runtimeDependencies: AuthServiceDependencies = {
  identities: mongooseIdentityRepository,
  sessions: runtimeRefreshSessions,
  verifyPassword: bcrypt.compare,
  prepareAuthorization: ensureLegacyAuthorizationForUser,
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
    const phone = normalizeLoginPhone(data.phone);
    const matches = await identities.findByPhone(phone);
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
    const session = await sessions.create(user.id, metadata);
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

export const registerAdminService = async (data: RegisterAdminInput) => {
  const { orgName, orgType, userName, password } = data;
  const phone = normalizeLoginPhone(data.phone);
  const organization = await Organization.create({
    name: orgName,
    type: orgType,
  });
  const branch = await Branch.create({
    organizationId: organization._id,
    name: 'Main',
    code: 'main',
    status: 'active',
  });
  const hashedPassword = await bcrypt.hash(password, 10);
  const adminUser = await User.create({
    tenantId: organization._id,
    name: userName,
    phone,
    password: hashedPassword,
    role: 'admin',
  });
  await Membership.create({
    userId: adminUser._id,
    organizationId: organization._id,
    role: 'admin',
    status: 'active',
    branchIds: [branch._id],
  });

  return {
    organization,
    branch,
    user: {
      id: adminUser._id,
      tenantId: adminUser.tenantId,
      name: adminUser.name,
      phone: adminUser.phone,
      role: adminUser.role,
    },
  };
};

export const updateThemeService = async (organizationId: string, data: ThemeInput) => {
  const organization = await Organization.findOne({ _id: organizationId });
  if (!organization) throw new AppError('Organization not found', 404);
  organization.theme = {
    mode: data.mode || organization.theme?.mode || 'light',
    primaryColor:
      data.primaryColor || organization.theme?.primaryColor || '#4F46E5',
  };
  await organization.save();
  return organization.theme;
};
