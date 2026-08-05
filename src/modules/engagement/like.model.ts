import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export type EngagementTargetType = 'reel' | 'post';

export interface Like {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  targetType: EngagementTargetType;
  targetId: Types.ObjectId;
  createdAt: Date;
}

export type LikeDocument = HydratedDocument<Like>;

const likeSchema = new Schema<Like>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['reel', 'post'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

likeSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true, name: 'uq_likes_user_target' },
);
likeSchema.index(
  { targetType: 1, targetId: 1 },
  { name: 'ix_likes_target' },
);

export const LikeModel: Model<Like> =
  (mongoose.models.Like as Model<Like> | undefined) ?? model<Like>('Like', likeSchema);
