import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const creatorApplicationStatuses = ['pending', 'approved', 'rejected', 'held'] as const;
export type CreatorApplicationStatus = (typeof creatorApplicationStatuses)[number];

export interface CreatorApplication {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  fullName: string;
  email: string;
  dateOfBirth?: Date;
  occupation?: string;
  contentCategory: string;
  contentLanguage: string;
  country: string;
  reason: string;
  idFrontUrl?: string;
  idBackUrl?: string;
  status: CreatorApplicationStatus;
  adminReason?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type CreatorApplicationDocument = HydratedDocument<CreatorApplication>;

const creatorApplicationSchema = new Schema<CreatorApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    dateOfBirth: { type: Date },
    occupation: { type: String, trim: true, maxlength: 120 },
    contentCategory: { type: String, required: true, trim: true, maxlength: 80 },
    contentLanguage: { type: String, required: true, trim: true, maxlength: 80 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    idFrontUrl: { type: String, trim: true, maxlength: 1000 },
    idBackUrl: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: creatorApplicationStatuses,
      default: 'pending',
      required: true,
      index: true,
    },
    adminReason: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

creatorApplicationSchema.index({ userId: 1, createdAt: -1 });
creatorApplicationSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'held'] } } },
);

export const CreatorApplicationModel: Model<CreatorApplication> =
  (mongoose.models.CreatorApplication as Model<CreatorApplication> | undefined) ??
  model<CreatorApplication>('CreatorApplication', creatorApplicationSchema);
