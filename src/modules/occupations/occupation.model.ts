import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface Occupation {
  _id: Types.ObjectId;
  name: string;
  normalizedName: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type OccupationDocument = HydratedDocument<Occupation>;

const occupationSchema = new Schema<Occupation>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

occupationSchema.index({ name: 'text' });

export const OccupationModel: Model<Occupation> =
  (mongoose.models.Occupation as Model<Occupation> | undefined) ??
  model<Occupation>('Occupation', occupationSchema);
