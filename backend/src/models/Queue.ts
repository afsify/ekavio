import mongoose, { Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

const queueSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    tokenNumber: { type: String, required: true },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    serviceType: { type: String, required: true },
    status: {
      type: String,
      enum: ["waiting", "serving", "completed", "cancelled"],
      default: "waiting",
    },
  },
  { timestamps: true },
);

export type QueueType = InferSchemaType<typeof queueSchema>;

export const Queue = mongoose.model("Queue", queueSchema);
