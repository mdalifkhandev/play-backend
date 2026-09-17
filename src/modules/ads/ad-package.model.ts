import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface AdPackage {
  _id: Types.ObjectId;
  name: string;
  days: number;
  priceUsd: number;
  targetUsers: number;
  description?: string | undefined;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AdPackageDocument = HydratedDocument<AdPackage>;

const adPackageSchema = new Schema<AdPackage>(
  {
    name: { type: String, trim: true, required: true, maxlength: 100 },
    days: { type: Number, required: true, min: 1, max: 365 },
    priceUsd: { type: Number, required: true, min: 1, max: 1_000_000 },
    targetUsers: { type: Number, required: true, min: 1, max: 100_000_000 },
    description: { type: String, trim: true, maxlength: 500 },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adPackageSchema.index({ isActive: 1, sortOrder: 1, days: 1 });

export const AdPackageModel: Model<AdPackage> = model<AdPackage>('AdPackage', adPackageSchema);

export const DEFAULT_AD_PACKAGES = [
  {
    name: '7 Days Starter',
    days: 7,
    priceUsd: 10,
    targetUsers: 500,
    description: 'Reach 500+ targeted users over 7 days. Great for starter promotions.',
    isPopular: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: '15 Days Growth',
    days: 15,
    priceUsd: 50,
    targetUsers: 3000,
    description: 'Boost engagement with up to 3,000 users over 2+ weeks.',
    isPopular: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: '30 Days Elite',
    days: 30,
    priceUsd: 100,
    targetUsers: 10000,
    description: 'Maximum reach and visibility for an entire month with 10,000+ users.',
    isPopular: false,
    isActive: true,
    sortOrder: 3,
  },
];
