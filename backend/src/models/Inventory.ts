import mongoose, { Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

const inventorySchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    itemName: { type: String, required: true },
    currentStock: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, required: true, default: 5 },
    price: { type: Number, required: true },
  },
  { timestamps: true },
);

export type InventoryType = InferSchemaType<typeof inventorySchema>;

export const Inventory = mongoose.model("Inventory", inventorySchema);
