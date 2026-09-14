import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';
import { moduleKeys } from '../commercial/catalogue.js';

const moduleDefinitionSchema = new Schema(
  {
    key: { type: String, enum: moduleKeys, required: true, unique: true, index: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    commercialType: {
      type: String,
      enum: ['core', 'purchasable'],
      required: true,
    },
    status: { type: String, enum: ['active', 'inactive'], required: true },
    version: { type: Number, min: 1, required: true },
  },
  { timestamps: true },
);

export type ModuleDefinitionType = InferSchemaType<typeof moduleDefinitionSchema>;
export const ModuleDefinition = mongoose.model('ModuleDefinition', moduleDefinitionSchema);
