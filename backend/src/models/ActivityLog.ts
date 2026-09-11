import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';

const activityLogSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
  },
  { timestamps: true }
);

export type ActivityLogType = InferSchemaType<typeof activityLogSchema>;

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
