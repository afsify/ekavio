import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';

const sessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    refreshTokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionType = InferSchemaType<typeof sessionSchema>;

export const Session = mongoose.model('Session', sessionSchema);
