import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { SupportMessageSenderType } from './support-request.constants.js';

export interface SupportMessage {
  _id: Types.ObjectId;
  supportRequestId: Types.ObjectId;
  senderUserId: Types.ObjectId;
  senderType: SupportMessageSenderType;
  message: string;
  createdAt: Date;
}

export type SupportMessageDocument = HydratedDocument<SupportMessage>;

const supportMessageSchema = new Schema<SupportMessage>(
  {
    supportRequestId: { type: Schema.Types.ObjectId, ref: 'SupportRequest', required: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderType: { type: String, enum: Object.values(SupportMessageSenderType), required: true },
    message: { type: String, required: true, trim: true, maxlength: 5_000 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

supportMessageSchema.index({ supportRequestId: 1, createdAt: 1 });

export const SupportMessageModel: Model<SupportMessage> =
  (mongoose.models.SupportMessage as Model<SupportMessage> | undefined) ??
  model<SupportMessage>('SupportMessage', supportMessageSchema);
