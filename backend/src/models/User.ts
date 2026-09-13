import mongoose, { Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    // Legacy compatibility fields. Membership is the authorization source of truth.
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    password: { type: String }, // Hashed password
    role: { type: String, enum: ["admin", "staff"], default: "staff" },
    assignments: [
      {
        tenantId: {
          type: Schema.Types.ObjectId,
          ref: "Organization",
          required: true,
        },
        role: {
          type: String,
          enum: ["admin", "staff", "hr", "owner"],
          required: true,
        },
      },
    ],
    platformRole: {
      type: String,
      enum: ['operator'],
      default: null,
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

export type UserType = InferSchemaType<typeof userSchema>;

export const User = mongoose.model("User", userSchema);
