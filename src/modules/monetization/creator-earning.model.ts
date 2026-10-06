import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export type CreatorEarningStatus = 'pending' | 'available' | 'held' | 'paid' | 'reversed';
export type CreatorEarningSource = 'reel_views';

export interface CreatorEarning {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  reelId?: Types.ObjectId;
  source: CreatorEarningSource;
  sourceKey: string;
  eligibleViews: number;
  payoutRateUsd: number;
  creatorSharePercent: number;
  grossUsd: number;
  amountUsd: number;
  currency: string;
  status: CreatorEarningStatus;
  availableAt: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type CreatorEarningDocument = HydratedDocument<CreatorEarning>;

const creatorEarningSchema = new Schema<CreatorEarning>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reelId: { type: Schema.Types.ObjectId, ref: 'Reel', index: true },
    source: { type: String, enum: ['reel_views'], required: true, index: true },
    sourceKey: { type: String, required: true, trim: true },
    eligibleViews: { type: Number, required: true, min: 1 },
    payoutRateUsd: { type: Number, required: true, min: 0 },
    creatorSharePercent: { type: Number, required: true, min: 0, max: 100 },
    grossUsd: { type: Number, required: true, min: 0 },
    amountUsd: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'usd', lowercase: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'available', 'held', 'paid', 'reversed'],
      default: 'pending',
      required: true,
      index: true,
    },
    availableAt: { type: Date, required: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true, versionKey: false },
);

creatorEarningSchema.index({ source: 1, sourceKey: 1 }, { unique: true });
creatorEarningSchema.index({ userId: 1, createdAt: -1 });
creatorEarningSchema.index({ status: 1, availableAt: 1 });

export const CreatorEarningModel: Model<CreatorEarning> =
  (mongoose.models.CreatorEarning as Model<CreatorEarning> | undefined) ??
  model<CreatorEarning>('CreatorEarning', creatorEarningSchema);
