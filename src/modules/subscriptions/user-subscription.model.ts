import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface UserSubscription {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  planId: string;
  planName: string;
  interval: 'month' | 'year' | 'lifetime';
  status: 'active' | 'expired' | 'canceled' | 'hold';
  provider: 'stripe' | 'revenuecat' | 'apple_pay';
  providerSubscriptionId?: string;
  startedAt: Date;
  expiresAt?: Date;
  canceledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UserSubscriptionDocument = HydratedDocument<UserSubscription>;

const userSubscriptionSchema = new Schema<UserSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: String, required: true, trim: true, lowercase: true, index: true },
    planName: { type: String, required: true, trim: true },
    interval: { type: String, enum: ['month', 'year', 'lifetime'], required: true },
    status: { type: String, enum: ['active', 'expired', 'canceled', 'hold'], required: true, index: true },
    provider: { type: String, enum: ['stripe', 'revenuecat', 'apple_pay'], required: true, index: true },
    providerSubscriptionId: { type: String, trim: true },
    startedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date },
    canceledAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

userSubscriptionSchema.index({ userId: 1, status: 1, updatedAt: -1 });
userSubscriptionSchema.index(
  { userId: 1, status: 1, createdAt: -1 },
  { name: 'ix_user_subscriptions_user_status_created' },
);
userSubscriptionSchema.index({ provider: 1, providerSubscriptionId: 1 }, { sparse: true });

export const UserSubscriptionModel: Model<UserSubscription> =
  (mongoose.models.UserSubscription as Model<UserSubscription> | undefined)
  ?? model<UserSubscription>('UserSubscription', userSubscriptionSchema);
