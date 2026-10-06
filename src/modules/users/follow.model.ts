import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface Follow {
  _id: Types.ObjectId;
  followerId: Types.ObjectId;
  followingId: Types.ObjectId;
  createdAt: Date;
}

export type FollowDocument = HydratedDocument<Follow>;

const followSchema = new Schema<Follow>(
  {
    followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

followSchema.index(
  { followerId: 1, followingId: 1 },
  { unique: true, name: 'uq_follows_follower_following' },
);
followSchema.index(
  { followingId: 1, createdAt: -1, _id: -1 },
  { name: 'ix_follows_followers_feed' },
);
followSchema.index(
  { followerId: 1, createdAt: -1, _id: -1 },
  { name: 'ix_follows_following_feed' },
);

export const FollowModel: Model<Follow> =
  (mongoose.models.Follow as Model<Follow> | undefined) ?? model<Follow>('Follow', followSchema);
