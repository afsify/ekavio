import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';

const notificationSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      enum: ['alert', 'info'],
      required: true,
    },
  },
  { timestamps: true }
);

export type NotificationType = InferSchemaType<typeof notificationSchema>;

export const Notification = mongoose.model('Notification', notificationSchema);
