import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const adCampaignStatuses = [
  'draft',
  'pending',
  'approved',
  'active',
  'paused',
  'held',
  'rejected',
  'completed',
  'cancelled',
] as const;

export type AdCampaignStatus = (typeof adCampaignStatuses)[number];

export const adPlacements = ['feed'] as const;
export type AdPlacement = (typeof adPlacements)[number];

export const adAudienceTypes = ['same_interest', 'interest_in_topic', 'all_users'] as const;
export type AdAudienceType = (typeof adAudienceTypes)[number];

export const adAreaTypes = ['city', 'country', 'world'] as const;
export type AdAreaType = (typeof adAreaTypes)[number];

export interface AdCampaign {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  category: string;
  days: number;
  budgetUsd: number;
  targetUsers: number;
  placement: AdPlacement;
  audienceType: AdAudienceType;
  areaType: AdAreaType;
  city?: string;
  country?: string;
  mediaAssetId?: Types.ObjectId;
  mediaKey?: string;
  mediaUrl?: string;
  title?: string;
  description?: string;
  destinationUrl?: string;
  status: AdCampaignStatus;
  adminReason?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  startsAt?: Date;
  endsAt?: Date;
  pausedAt?: Date;
  heldAt?: Date;
  metrics: {
    impressions: number;
    clicks: number;
    spendUsd: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type AdCampaignDocument = HydratedDocument<AdCampaign>;

const adCampaignSchema = new Schema<AdCampaign>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, trim: true, required: true, maxlength: 80 },
    days: { type: Number, required: true, min: 1, max: 365 },
    budgetUsd: { type: Number, required: true, min: 1 },
    targetUsers: { type: Number, required: true, min: 1 },
    placement: { type: String, enum: adPlacements, default: 'feed', required: true },
    audienceType: { type: String, enum: adAudienceTypes, required: true },
    areaType: { type: String, enum: adAreaTypes, required: true },
    city: { type: String, trim: true, maxlength: 120 },
    country: { type: String, trim: true, maxlength: 120 },
    mediaAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset' },
    mediaKey: { type: String, trim: true, maxlength: 500 },
    mediaUrl: { type: String, trim: true, maxlength: 1000 },
    title: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    destinationUrl: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: adCampaignStatuses, default: 'pending', required: true, index: true },
    adminReason: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    startsAt: { type: Date },
    endsAt: { type: Date },
    pausedAt: { type: Date },
    heldAt: { type: Date },
    metrics: {
      impressions: { type: Number, default: 0, min: 0, required: true },
      clicks: { type: Number, default: 0, min: 0, required: true },
      spendUsd: { type: Number, default: 0, min: 0, required: true },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adCampaignSchema.index({ status: 1, createdAt: -1 });
adCampaignSchema.index({ ownerId: 1, createdAt: -1 });
adCampaignSchema.index({ placement: 1, status: 1, startsAt: 1, endsAt: 1 });
adCampaignSchema.index(
  { status: 1, placement: 1, createdAt: -1 },
  { name: 'ix_ads_status_placement_created' },
);

export const AdCampaignModel: Model<AdCampaign> =
  model<AdCampaign>('AdCampaign', adCampaignSchema);
