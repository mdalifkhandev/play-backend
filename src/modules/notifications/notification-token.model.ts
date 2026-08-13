import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const pushTokenPlatforms = ['ios', 'android', 'web'] as const;
export type PushTokenPlatform = (typeof pushTokenPlatforms)[number];

export interface PushNotificationToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  token: string;
  platform: PushTokenPlatform;
  deviceId?: string;
  appVersion?: string;
  isActive: boolean;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type PushNotificationTokenDocument = HydratedDocument<PushNotificationToken>;

const pushNotificationTokenSchema = new Schema<PushNotificationToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, trim: true, unique: true },
    platform: { type: String, enum: pushTokenPlatforms, required: true },
    deviceId: { type: String, trim: true, maxlength: 200 },
    appVersion: { type: String, trim: true, maxlength: 50 },
    isActive: { type: Boolean, default: true, required: true, index: true },
    lastUsedAt: { type: Date, default: () => new Date(), required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

pushNotificationTokenSchema.index({ userId: 1, isActive: 1 });
pushNotificationTokenSchema.index({ userId: 1, deviceId: 1 }, { sparse: true });

export const PushNotificationTokenModel: Model<PushNotificationToken> =
  (mongoose.models.PushNotificationToken as Model<PushNotificationToken> | undefined) ??
  model<PushNotificationToken>('PushNotificationToken', pushNotificationTokenSchema);
