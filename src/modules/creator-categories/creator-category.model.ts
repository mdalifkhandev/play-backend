import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface CreatorCategory {
  _id: Types.ObjectId;
  name: string;
  normalizedName: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type CreatorCategoryDocument = HydratedDocument<CreatorCategory>;

const creatorCategorySchema = new Schema<CreatorCategory>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

creatorCategorySchema.index({ name: 'text' });

export const CreatorCategoryModel: Model<CreatorCategory> =
  (mongoose.models.CreatorCategory as Model<CreatorCategory> | undefined) ??
  model<CreatorCategory>('CreatorCategory', creatorCategorySchema);
