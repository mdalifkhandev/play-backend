import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface CreatorRequirementSetting {
  _id: mongoose.Types.ObjectId;
  profileEnabled: boolean;
  followers: number;
  followersEnabled: boolean;
  views: number;
  viewsEnabled: boolean;
  watchTimeMinutes: number;
  watchTimeEnabled: boolean;
  likes: number;
  likesEnabled: boolean;
  accountAgeDays: number;
  accountAgeEnabled: boolean;
  reels: number;
  reelsEnabled: boolean;
  reportLimit: number;
  guidelinesEnabled: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type CreatorRequirementSettingDocument = HydratedDocument<CreatorRequirementSetting>;

const creatorRequirementSettingSchema = new Schema<CreatorRequirementSetting>(
  {
    profileEnabled: { type: Boolean, required: true, default: true },
    followers: { type: Number, required: true, default: 1000, min: 0 },
    followersEnabled: { type: Boolean, required: true, default: true },
    views: { type: Number, required: true, default: 100000, min: 0 },
    viewsEnabled: { type: Boolean, required: true, default: true },
    watchTimeMinutes: { type: Number, required: true, default: 1000, min: 0 },
    watchTimeEnabled: { type: Boolean, required: true, default: false },
    likes: { type: Number, required: true, default: 10000, min: 0 },
    likesEnabled: { type: Boolean, required: true, default: false },
    accountAgeDays: { type: Number, required: true, default: 30, min: 0 },
    accountAgeEnabled: { type: Boolean, required: true, default: true },
    reels: { type: Number, required: true, default: 3, min: 0 },
    reelsEnabled: { type: Boolean, required: true, default: false },
    reportLimit: { type: Number, required: true, default: 0, min: 0 },
    guidelinesEnabled: { type: Boolean, required: true, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const CreatorRequirementSettingModel: Model<CreatorRequirementSetting> =
  (mongoose.models.CreatorRequirementSetting as Model<CreatorRequirementSetting> | undefined) ??
  model<CreatorRequirementSetting>('CreatorRequirementSetting', creatorRequirementSettingSchema);
