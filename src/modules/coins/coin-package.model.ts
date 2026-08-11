import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface CoinPackage {
  _id: mongoose.Types.ObjectId;
  name: string;
  coins: number;
  price: number;
  currency: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
  stripePriceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CoinPackageDocument = HydratedDocument<CoinPackage>;

const coinPackageSchema = new Schema<CoinPackage>(
  {
    name: { type: String, required: true, trim: true },
    coins: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'usd', lowercase: true, trim: true },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    stripePriceId: { type: String, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

coinPackageSchema.index({ isActive: 1, sortOrder: 1, price: 1 });

export const CoinPackageModel: Model<CoinPackage> =
  (mongoose.models.CoinPackage as Model<CoinPackage> | undefined) ??
  model<CoinPackage>('CoinPackage', coinPackageSchema);
