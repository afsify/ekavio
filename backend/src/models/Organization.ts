import mongoose, { Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

const organizationSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true }, // e.g., 'shop', 'clinic', 'salon'
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    activeModules: [{ type: String }],
    theme: {
      mode: { type: String, enum: ["light", "dark"], default: "light" },
      primaryColor: { type: String, default: "#4F46E5" },
    },
  },
  { timestamps: true },
);

// Magically infer the type without OOP interfaces
export type OrganizationType = InferSchemaType<typeof organizationSchema>;

export const Organization = mongoose.model("Organization", organizationSchema);
