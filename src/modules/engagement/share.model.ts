import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { EngagementTargetType } from './like.model.js';

export type ShareChannel =
  | 'profile'
  | 'copy_link'
  | 'whatsapp'
  | 'facebook'
  | 'messenger'
  | 'other';

export interface Share {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  targetType: EngagementTargetType;
  targetId: Types.ObjectId;
  channel: ShareChannel;
  createdAt: Date;
}

export type ShareDocument = HydratedDocument<Share>;

const shareSchema = new Schema<Share>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['reel', 'post'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    channel: {
      type: String,
      enum: ['profile', 'copy_link', 'whatsapp', 'facebook', 'messenger', 'other'],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

shareSchema.index(
  { targetType: 1, targetId: 1, createdAt: -1 },
  { name: 'ix_shares_target_created' },
);
shareSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true, name: 'uq_shares_user_target' },
);

export const ShareModel: Model<Share> =
  (mongoose.models.Share as Model<Share> | undefined) ?? model<Share>('Share', shareSchema);
