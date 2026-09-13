import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';

export const branchStatuses = ['active', 'inactive'] as const;
export type BranchStatus = (typeof branchStatuses)[number];

const branchSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: branchStatuses,
      default: 'active',
      required: true,
    },
  },
  { timestamps: true },
);

branchSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export type BranchType = InferSchemaType<typeof branchSchema>;

export const Branch = mongoose.model('Branch', branchSchema);
