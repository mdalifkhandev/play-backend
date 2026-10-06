import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface Session {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  rememberMe: boolean;
  ipAddress?: string;
  userAgent?: string;
  revokedAt?: Date;
  replacedBySessionId?: Types.ObjectId;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionDocument = HydratedDocument<Session>;

const sessionSchema = new Schema<Session>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true, index: true },
    rememberMe: { type: Boolean, default: false, required: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    revokedAt: { type: Date },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'Session' },
    lastUsedAt: { type: Date, default: Date.now, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export const SessionModel: Model<Session> =
  (mongoose.models.Session as Model<Session> | undefined) ??
  model<Session>('Session', sessionSchema);
