import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface RewardSetting {
  _id: Types.ObjectId;
  periodDays: number;
  leaderboardLimit: number;
  viewsWeight: number;
  likesWeight: number;
  commentsWeight: number;
  sharesWeight: number;
  followersWeight: number;
  isActive: boolean;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type RewardSettingDocument = HydratedDocument<RewardSetting>;

const rewardSettingSchema = new Schema<RewardSetting>(
  {
    periodDays: { type: Number, default: 7, min: 1, max: 365, required: true },
    leaderboardLimit: { type: Number, default: 10, min: 1, max: 100, required: true },
    viewsWeight: { type: Number, default: 1, min: 0, max: 100, required: true },
    likesWeight: { type: Number, default: 3, min: 0, max: 100, required: true },
    commentsWeight: { type: Number, default: 5, min: 0, max: 100, required: true },
    sharesWeight: { type: Number, default: 6, min: 0, max: 100, required: true },
    followersWeight: { type: Number, default: 10, min: 0, max: 100, required: true },
    isActive: { type: Boolean, default: true, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

export const RewardSettingModel: Model<RewardSetting> =
  (mongoose.models.RewardSetting as Model<RewardSetting> | undefined)
  ?? model<RewardSetting>('RewardSetting', rewardSettingSchema);
