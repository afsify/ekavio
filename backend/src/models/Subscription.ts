import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';
import { commercialSources, subscriptionStatuses } from '../commercial/catalogue.js';

const subscriptionAddOnSchema = new Schema(
  {
    addOnId: { type: Schema.Types.ObjectId, ref: 'AddOn', required: true },
    startsAt: { type: Date },
    endsAt: { type: Date },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    addOns: { type: [subscriptionAddOnSchema], default: [] },
    status: { type: String, enum: subscriptionStatuses, required: true, index: true },
    source: { type: String, enum: commercialSources, required: true },
    startsAt: { type: Date, required: true },
    currentPeriodEndsAt: { type: Date },
    billingCycle: { type: String, enum: ['monthly', 'yearly'] },
    suspendedAt: { type: Date },
    cancelledAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type SubscriptionType = InferSchemaType<typeof subscriptionSchema>;
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
