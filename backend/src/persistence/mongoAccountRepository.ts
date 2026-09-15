import { Branch } from '../models/Branch.js';
import { Membership } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import type { AccountRepository } from '../services/accountPersistence.js';

export const mongooseAccountRepository: AccountRepository = {
  async registerAdmin(input) {
    const organization = await Organization.create({ name: input.orgName, type: input.orgType });
    const branch = await Branch.create({
      organizationId: organization._id,
      name: 'Main',
      code: 'main',
      status: 'active',
    });
    const user = await User.create({
      tenantId: organization._id,
      name: input.userName,
      phone: input.phone,
      password: input.passwordHash,
      role: 'admin',
    });
    await Membership.create({
      userId: user._id,
      organizationId: organization._id,
      role: 'admin',
      status: 'active',
      branchIds: [branch._id],
    });
    return {
      organization,
      branch,
      user: {
        id: user._id,
        tenantId: user.tenantId,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  },

  async updateTheme(organizationId, data) {
    const organization = await Organization.findOne({ _id: organizationId });
    if (!organization) return null;
    organization.theme = {
      mode: data.mode || organization.theme?.mode || 'light',
      primaryColor: data.primaryColor || organization.theme?.primaryColor || '#4F46E5',
    };
    await organization.save();
    return organization.theme;
  },

  async updateProfileName(userId, name) {
    return User.findByIdAndUpdate(userId, { name }, { new: true }).select('-password');
  },

  async findPasswordHash(userId) {
    const user = await User.findById(userId).select('password').lean();
    return user?.password ?? null;
  },

  async replacePasswordHashAndRevokeSessions(userId, passwordHash) {
    const user = await User.findById(userId);
    if (!user) return false;
    user.password = passwordHash;
    await user.save();
    await Session.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return true;
  },
};
