import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  SupportCategory,
  SupportPriority,
  SupportRequestStatus,
} from './support-request.constants.js';

export interface SupportRequest {
  _id: Types.ObjectId;
  ticketNumber: string;
  requesterUserId: Types.ObjectId;
  category: SupportCategory;
  subject: string;
  status: SupportRequestStatus;
  priority: SupportPriority;
  assignedTo?: Types.ObjectId;
  messageCount: number;
  lastMessageAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SupportRequestDocument = HydratedDocument<SupportRequest>;

const supportRequestSchema = new Schema<SupportRequest>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    requesterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: Object.values(SupportCategory), required: true },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    status: {
      type: String,
      enum: Object.values(SupportRequestStatus),
      default: SupportRequestStatus.OPEN,
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(SupportPriority),
      default: SupportPriority.NORMAL,
      required: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    messageCount: { type: Number, required: true, default: 1, min: 1 },
    lastMessageAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

supportRequestSchema.index({ requesterUserId: 1, updatedAt: -1 });
supportRequestSchema.index({ status: 1, priority: -1, lastMessageAt: -1 });
supportRequestSchema.index({ assignedTo: 1, status: 1, lastMessageAt: -1 });
supportRequestSchema.index({ category: 1, status: 1 });

export const SupportRequestModel: Model<SupportRequest> =
  (mongoose.models.SupportRequest as Model<SupportRequest> | undefined) ??
  model<SupportRequest>('SupportRequest', supportRequestSchema);
