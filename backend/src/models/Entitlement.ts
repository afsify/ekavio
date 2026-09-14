import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';
import { commercialSources, moduleKeys } from '../commercial/catalogue.js';

const entitlementSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    moduleKey: { type: String, enum: moduleKeys, required: true },
    effect: { type: String, enum: ['grant', 'revoke'], required: true },
    status: { type: String, enum: ['active', 'inactive'], required: true },
    source: { type: String, enum: commercialSources, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    validFrom: { type: Date },
    validUntil: { type: Date },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

entitlementSchema.index({ organizationId: 1, moduleKey: 1 }, { unique: true });

export type EntitlementType = InferSchemaType<typeof entitlementSchema>;
export const Entitlement = mongoose.model('Entitlement', entitlementSchema);
