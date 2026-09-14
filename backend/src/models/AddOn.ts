import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';
import { limitKeys, moduleKeys } from '../commercial/catalogue.js';

const limitAdjustmentSchema = new Schema(
  {
    key: { type: String, enum: limitKeys, required: true },
    mode: { type: String, enum: ['add', 'override'], required: true },
    value: { type: Number, min: 0, required: true },
  },
  { _id: false },
);

const addOnSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], required: true },
    available: { type: Boolean, required: true, default: true },
    moduleKeys: [{ type: String, enum: moduleKeys }],
    limitAdjustments: { type: [limitAdjustmentSchema], default: [] },
    version: { type: Number, min: 1, required: true },
  },
  { timestamps: true },
);

export type AddOnType = InferSchemaType<typeof addOnSchema>;
export const AddOn = mongoose.model('AddOn', addOnSchema);
