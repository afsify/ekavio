import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';
import type { StaffRecord, StaffRepository } from '../services/staffService.js';

export const mongooseStaffRepository: StaffRepository = {
  async list(organizationId) {
    const memberships = await Membership.find({ organizationId, status: 'active' })
      .sort({ createdAt: -1 })
      .lean();
    const users = await User.find({
      _id: { $in: memberships.map((membership) => membership.userId) },
    }).select('name phone createdAt').lean();
    const userById = new Map(users.map((user) => [String(user._id), user]));
    return memberships.flatMap((membership): StaffRecord[] => {
      const user = userById.get(String(membership.userId));
      if (!user) return [];
      return [{
        id: String(user._id),
        name: user.name,
        phone: user.phone,
        role: membership.role,
        membershipId: String(membership._id),
        branchIds: membership.branchIds.map(String),
        createdAt: user.createdAt,
      }];
    });
  },

  async create(input) {
    if (await User.exists({ phone: input.phone })) return 'phone-conflict';
    const user = await User.create({
      tenantId: input.organizationId,
      name: input.name,
      phone: input.phone,
      password: input.passwordHash,
      role: input.role === 'admin' ? 'admin' : 'staff',
    });
    const membership = await Membership.create({
      userId: user._id,
      organizationId: input.organizationId,
      role: input.role,
      status: 'active',
      branchIds: input.branchId ? [input.branchId] : [],
    });
    return {
      id: String(user._id),
      name: user.name,
      phone: user.phone,
      role: membership.role,
      membershipId: String(membership._id),
      branchIds: membership.branchIds.map(String),
      createdAt: user.createdAt,
    };
  },

  async revoke(organizationId, userId) {
    const membership = await Membership.findOneAndUpdate(
      { userId, organizationId, status: 'active' },
      { $set: { status: 'revoked' } },
      { new: true, runValidators: true },
    );
    return membership ? { membershipId: String(membership._id) } : null;
  },
};
