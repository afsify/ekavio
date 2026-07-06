import mongoose, { Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

const ledgerSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["credit", "payment"], required: true },
    description: { type: String },
  },
  { timestamps: true },
);

export type LedgerType = InferSchemaType<typeof ledgerSchema>;

export const Ledger = mongoose.model("Ledger", ledgerSchema);
