import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { getRuntimeConfig } from '../config/env.js';
import { runtimeRefreshSessions } from './sessionService.js';
import type {
  RefreshSessionManager,
  SessionMetadata,
} from './sessionService.js';
import { AppError } from '../utils/AppError.js';

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
}

export interface PublicUser {
  id: string;
  tenantId: string;
  role: string;
  name?: string;
  phone: string;
  assignments: Array<IdentityAssignment & { orgName?: string }>;
  activeModules: string[];
  tenant: { activeModules: string[] };
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  user: PublicUser;
  assignments: PublicUser['assignments'];
  activeModules: string[];
  theme: { mode: 'light' | 'dark'; primaryColor: string };
}

export interface AuthResponse extends AuthContext {
  accessToken: string;
}

export interface AuthResult {
  response: AuthResponse;
  refreshCredential: string;
}

export interface IdentityRepository {
  findByPhone(phone: string): Promise<IdentityUser[]>;
  findById(userId: string): Promise<IdentityUser | null>;
  buildContext(user: IdentityUser): Promise<AuthContext>;
}

export interface AuthService {
  login(data: LoginInput, metadata?: SessionMetadata): Promise<AuthResult>;
  refresh(refreshCredential: string): Promise<AuthResult>;
  logout(refreshCredential: string | undefined): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;
}

export interface AuthServiceDependencies {
  identities: IdentityRepository;
  sessions: RefreshSessionManager;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  signAccessToken: (user: IdentityUser, sessionId: string) => string;
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
});

export const mongooseIdentityRepository: IdentityRepository = {
  async findByPhone(phone) {
    const users = await User.find({ phone }).limit(2);
    return users.map(toIdentityUser);
  },

  async findById(userId) {
    const user = await User.findById(userId);
    return user ? toIdentityUser(user) : null;
  },

  async buildContext(user) {
    const tenantIds = [
      user.tenantId,
      ...user.assignments.map((assignment) => assignment.tenantId),
    ];
    const organizations = await Organization.find({ _id: { $in: tenantIds } });
    const organizationById = new Map(
      organizations.map((organization) => [String(organization._id), organization]),
    );
    const primaryOrganization = organizationById.get(user.tenantId);
    const activeModules = [...(primaryOrganization?.activeModules ?? [])];
    const assignments = user.assignments
      .filter((assignment) => assignment.tenantId !== user.tenantId)
      .map((assignment) => {
        const organization = organizationById.get(assignment.tenantId);
        return {
          ...assignment,
          ...(organization?.name ? { orgName: organization.name } : {}),
        };
      });
    const theme = primaryOrganization?.theme
      ? {
          mode: primaryOrganization.theme.mode,
          primaryColor: primaryOrganization.theme.primaryColor,
        }
      : { mode: 'light' as const, primaryColor: '#4F46E5' };
    const publicUser: PublicUser = {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      ...(user.name ? { name: user.name } : {}),
      phone: user.phone,
      assignments,
      activeModules,
      tenant: { activeModules },
    };

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      user: publicUser,
      assignments,
      activeModules,
      theme,
    };
  },
};

const runtimeDependencies: AuthServiceDependencies = {
  identities: mongooseIdentityRepository,
  sessions: runtimeRefreshSessions,
  verifyPassword: bcrypt.compare,
  signAccessToken: (user, sessionId) =>
    jwt.sign(
      {
        id: user.id,
        tenantId: user.tenantId,
        role: user.role,
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
}: AuthServiceDependencies): AuthService => ({
  async login(data, metadata) {
    const phone = normalizeLoginPhone(data.phone);
    const matches = await identities.findByPhone(phone);

    if (matches.length === 0) {
      throw new AppError('Invalid credentials', 401);
    }

    if (matches.length > 1) {
      throw new AppError(
        'Multiple accounts use this phone number. Account migration is required before sign-in.',
        409,
      );
    }

    const user = matches[0];
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const passwordMatches = await verifyPassword(data.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Invalid credentials', 401);
    }

    const context = await identities.buildContext(user);
    const session = await sessions.create(user.id, metadata);

    return {
      refreshCredential: session.refreshCredential,
      response: {
        accessToken: signAccessToken(user, session.sessionId),
        ...context,
      },
    };
  },

  async refresh(refreshCredential) {
    const session = await sessions.rotate(refreshCredential);
    const user = await identities.findById(session.userId);

    if (!user) {
      await sessions.revoke(session.refreshCredential);
      throw new AppError('Invalid refresh session', 401);
    }

    const context = await identities.buildContext(user);
    return {
      refreshCredential: session.refreshCredential,
      response: {
        accessToken: signAccessToken(user, session.sessionId),
        ...context,
      },
    };
  },

  async logout(refreshCredential) {
    await sessions.revoke(refreshCredential);
  },

  async revokeUserSessions(userId) {
    await sessions.revokeAllForUser(userId);
  },
});

export const authService = createAuthService(runtimeDependencies);

export const registerAdminService = async (data: RegisterAdminInput) => {
  const { orgName, orgType, userName, password } = data;
  const phone = normalizeLoginPhone(data.phone);

  const organization = new Organization({
    name: orgName,
    type: orgType,
    activeModules: ['queue'],
  });

  await organization.save();

  const hashedPassword = await bcrypt.hash(password, 10);
  const adminUser = new User({
    tenantId: organization._id,
    name: userName,
    phone,
    password: hashedPassword,
    role: 'admin',
  });

  await adminUser.save();

  return {
    organization,
    user: {
      id: adminUser._id,
      tenantId: adminUser.tenantId,
      name: adminUser.name,
      phone: adminUser.phone,
      role: adminUser.role,
    },
  };
};

export const updateThemeService = async (tenantId: string, data: ThemeInput) => {
  const { mode, primaryColor } = data;
  const organization = await Organization.findById(tenantId);

  if (!organization) {
    throw new AppError('Organization not found', 404);
  }

  organization.theme = {
    mode: mode || organization.theme?.mode || 'light',
    primaryColor: primaryColor || organization.theme?.primaryColor || '#4F46E5',
  };

  await organization.save();
  return organization.theme;
};
