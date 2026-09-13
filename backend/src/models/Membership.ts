import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';

export const membershipRoles = ['owner', 'admin', 'manager', 'hr', 'staff'] as const;
export type MembershipRole = (typeof membershipRoles)[number];

export const membershipStatuses = ['active', 'inactive', 'revoked'] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

const membershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    role: { type: String, enum: membershipRoles, required: true },
    status: {
      type: String,
      enum: membershipStatuses,
      default: 'active',
      required: true,
    },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  },
  { timestamps: true },
);

membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, status: 1 });

export type MembershipType = InferSchemaType<typeof membershipSchema>;

export const Membership = mongoose.model('Membership', membershipSchema);
