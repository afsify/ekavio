import mongoose, { Schema } from "mongoose";
import type { InferSchemaType } from "mongoose";

const attendanceSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["present", "absent", "half-day"],
      required: true,
    },
  },
  { timestamps: true },
);

attendanceSchema.index({ tenantId: 1, date: 1 });
attendanceSchema.index({ tenantId: 1, userId: 1, date: 1 }, { unique: true });

export type AttendanceType = InferSchemaType<typeof attendanceSchema>;

export const Attendance = mongoose.model("Attendance", attendanceSchema);
