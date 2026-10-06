import mongoose, { Schema, Types, model } from 'mongoose';
import type { HydratedDocument, Model } from 'mongoose';

export interface PendingSignup {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  legalConsents?: unknown;
  ipAddress?: string;
  userAgent?: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type PendingSignupDocument = HydratedDocument<PendingSignup>;

const pendingSignupSchema = new Schema<PendingSignup>(
  {
    email: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    legalConsents: { type: Schema.Types.Mixed },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingSignupModel: Model<PendingSignup> =
  (mongoose.models.PendingSignup as Model<PendingSignup> | undefined) ??
  model<PendingSignup>('PendingSignup', pendingSignupSchema);
