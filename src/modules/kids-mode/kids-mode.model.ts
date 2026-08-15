import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export enum KidsAgeGroup {
  THREE_TO_SIX = '3-6',
  SEVEN_TO_NINE = '7-9',
  TEN_TO_FIFTEEN = '10-15',
}

export interface KidsMode {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  pinHash: string;
  childNickname?: string;
  ageGroup: KidsAgeGroup;
  dailyLimitMinutes: number;
  isActive: boolean;
  sessionStartedAt?: Date;
  usageDate: string;
  usedSeconds: number;
  failedPinAttempts: number;
  pinLockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type KidsModeDocument = HydratedDocument<KidsMode>;

const kidsModeSchema = new Schema<KidsMode>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    pinHash: { type: String, required: true, select: false },
    childNickname: { type: String, trim: true, maxlength: 40 },
    ageGroup: { type: String, enum: Object.values(KidsAgeGroup), required: true },
    dailyLimitMinutes: { type: Number, required: true, min: 1, max: 1_440 },
    isActive: { type: Boolean, default: false, required: true },
    sessionStartedAt: { type: Date },
    usageDate: { type: String, required: true },
    usedSeconds: { type: Number, default: 0, min: 0, required: true },
    failedPinAttempts: { type: Number, default: 0, min: 0, required: true },
    pinLockedUntil: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

kidsModeSchema.index({ isActive: 1, sessionStartedAt: 1 }, { name: 'ix_kids_mode_active' });

export const KidsModeModel: Model<KidsMode> =
  (mongoose.models.KidsMode as Model<KidsMode> | undefined) ??
  model<KidsMode>('KidsMode', kidsModeSchema);
