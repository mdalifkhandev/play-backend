import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface PlatformLanguage {
  code: string;
  name: string;
  active: boolean;
}

export interface PlatformPayoutRate {
  region: string;
  rateUsd: number;
}

export interface PlatformFeatureFlags {
  liveStreaming: boolean;
  ads: boolean;
  kidsMode: boolean;
  rewards: boolean;
  subscriptions: boolean;
  creatorApplications: boolean;
  coinPurchase: boolean;
  withdrawals: boolean;
}

export interface PlatformSetting {
  _id: mongoose.Types.ObjectId;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  videosBetweenAds: number;
  payoutPerThousandViewsUsd: number;
  payoutRates: PlatformPayoutRate[];
  languages: PlatformLanguage[];
  featureFlags: PlatformFeatureFlags;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type PlatformSettingDocument = HydratedDocument<PlatformSetting>;

const platformLanguageSchema = new Schema<PlatformLanguage>(
  {
    code: { type: String, required: true, trim: true, lowercase: true, maxlength: 12 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    active: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const platformPayoutRateSchema = new Schema<PlatformPayoutRate>(
  {
    region: { type: String, required: true, trim: true, maxlength: 80 },
    rateUsd: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const platformSettingSchema = new Schema<PlatformSetting>(
  {
    maintenanceMode: { type: Boolean, required: true, default: false },
    maintenanceMessage: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
      default: 'Play is under maintenance. Please try again soon.',
    },
    videosBetweenAds: { type: Number, required: true, min: 1, max: 100, default: 6 },
    payoutPerThousandViewsUsd: { type: Number, required: true, min: 0, max: 1000, default: 3.5 },
    payoutRates: {
      type: [platformPayoutRateSchema],
      default: [
        { region: 'North America', rateUsd: 4.2 },
        { region: 'Europe', rateUsd: 3.8 },
        { region: 'Asia Pacific', rateUsd: 2.1 },
        { region: 'Latin America', rateUsd: 1.6 },
      ],
    },
    languages: {
      type: [platformLanguageSchema],
      default: [
        { code: 'en', name: 'English', active: true },
        { code: 'bn', name: 'Bangla', active: true },
        { code: 'hi', name: 'Hindi', active: false },
        { code: 'es', name: 'Spanish', active: false },
      ],
    },
    featureFlags: {
      liveStreaming: { type: Boolean, required: true, default: true },
      ads: { type: Boolean, required: true, default: true },
      kidsMode: { type: Boolean, required: true, default: true },
      rewards: { type: Boolean, required: true, default: true },
      subscriptions: { type: Boolean, required: true, default: true },
      creatorApplications: { type: Boolean, required: true, default: true },
      coinPurchase: { type: Boolean, required: true, default: true },
      withdrawals: { type: Boolean, required: true, default: true },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

export const PlatformSettingModel: Model<PlatformSetting> =
  (mongoose.models.PlatformSetting as Model<PlatformSetting> | undefined) ??
  model<PlatformSetting>('PlatformSetting', platformSettingSchema);
