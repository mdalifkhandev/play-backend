import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface GiftCatalog {
  _id: mongoose.Types.ObjectId;
  name: string;
  code: string;
  icon: string;
  coinPrice: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type GiftCatalogDocument = HydratedDocument<GiftCatalog>;

const giftCatalogSchema = new Schema<GiftCatalog>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, lowercase: true, unique: true },
    icon: { type: String, required: true, trim: true },
    coinPrice: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

giftCatalogSchema.index({ isActive: 1, sortOrder: 1, coinPrice: 1 });

export const GiftCatalogModel: Model<GiftCatalog> =
  (mongoose.models.GiftCatalog as Model<GiftCatalog> | undefined) ??
  model<GiftCatalog>('GiftCatalog', giftCatalogSchema);
