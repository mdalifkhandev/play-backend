import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export type AuthCodePurpose = 'email_verification' | 'password_reset';

export interface AuthCode {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  purpose: AuthCodePurpose;
  codeHash: string;
  attempts: number;
  consumedAt?: Date;
  verifiedAt?: Date;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthCodeDocument = HydratedDocument<AuthCode>;

const authCodeSchema = new Schema<AuthCode>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, trim: true, lowercase: true, required: true, index: true },
    purpose: {
      type: String,
      enum: ['email_verification', 'password_reset'],
      required: true,
      index: true,
    },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0, required: true },
    consumedAt: { type: Date },
    verifiedAt: { type: Date },
    resetTokenHash: { type: String, index: true },
    resetTokenExpiresAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

authCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authCodeSchema.index({ email: 1, purpose: 1, consumedAt: 1, expiresAt: 1 });

export const AuthCodeModel: Model<AuthCode> =
  (mongoose.models.AuthCode as Model<AuthCode> | undefined) ??
  model<AuthCode>('AuthCode', authCodeSchema);
