import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';

const parentOrganizationSchema = new Schema(
  {
    name: { type: String, required: true },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    consolidatedBilling: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type ParentOrganizationType = InferSchemaType<typeof parentOrganizationSchema>;

export const ParentOrganization = mongoose.model('ParentOrganization', parentOrganizationSchema);
