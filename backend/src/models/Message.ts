import mongoose, { Schema } from 'mongoose';
import type { InferSchemaType } from 'mongoose';

const messageSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export type MessageType = InferSchemaType<typeof messageSchema>;

export const Message = mongoose.model('Message', messageSchema);
