import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface AdCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  icon?: string | undefined;
  description?: string | undefined;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AdCategoryDocument = HydratedDocument<AdCategory>;

const adCategorySchema = new Schema<AdCategory>(
  {
    name: { type: String, trim: true, required: true, maxlength: 100, unique: true },
    slug: { type: String, trim: true, required: true, maxlength: 120, lowercase: true, unique: true },
    icon: { type: String, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adCategorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const AdCategoryModel: Model<AdCategory> = model<AdCategory>('AdCategory', adCategorySchema);

export const DEFAULT_AD_CATEGORIES = [
  { name: 'Food', slug: 'food', icon: 'restaurant-outline', sortOrder: 1, isActive: true },
  { name: 'Fashion', slug: 'fashion', icon: 'shirt-outline', sortOrder: 2, isActive: true },
  { name: 'Music', slug: 'music', icon: 'musical-notes-outline', sortOrder: 3, isActive: true },
  { name: 'Sports', slug: 'sports', icon: 'football-outline', sortOrder: 4, isActive: true },
  { name: 'Education', slug: 'education', icon: 'school-outline', sortOrder: 5, isActive: true },
  { name: 'Travel', slug: 'travel', icon: 'airplane-outline', sortOrder: 6, isActive: true },
  { name: 'Technology', slug: 'technology', icon: 'hardware-chip-outline', sortOrder: 7, isActive: true },
  { name: 'Health', slug: 'health', icon: 'medkit-outline', sortOrder: 8, isActive: true },
  { name: 'Beauty', slug: 'beauty', icon: 'sparkles-outline', sortOrder: 9, isActive: true },
  { name: 'Business', slug: 'business', icon: 'briefcase-outline', sortOrder: 10, isActive: true },
  { name: 'Gaming', slug: 'gaming', icon: 'game-controller-outline', sortOrder: 11, isActive: true },
  { name: 'Entertainment', slug: 'entertainment', icon: 'film-outline', sortOrder: 12, isActive: true },
];
