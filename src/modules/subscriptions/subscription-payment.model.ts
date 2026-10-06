import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface SubscriptionPayment {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  subscriptionId?: mongoose.Types.ObjectId;
  planId: string;
  planName: string;
  interval: 'month' | 'year' | 'lifetime';
  amount: number;
  currency: string;
  provider: 'stripe' | 'revenuecat';
  providerPaymentId: string;
  status: 'completed' | 'refunded';
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionPaymentDocument = HydratedDocument<SubscriptionPayment>;

const subscriptionPaymentSchema = new Schema<SubscriptionPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'UserSubscription', index: true },
    planId: { type: String, required: true, trim: true, lowercase: true },
    planName: { type: String, required: true, trim: true },
    interval: { type: String, enum: ['month', 'year', 'lifetime'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'usd', lowercase: true, trim: true },
    provider: { type: String, enum: ['stripe', 'revenuecat'], required: true, index: true },
    providerPaymentId: { type: String, required: true, trim: true },
    status: { type: String, enum: ['completed', 'refunded'], default: 'completed', required: true, index: true },
    completedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

subscriptionPaymentSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true });
subscriptionPaymentSchema.index({ status: 1, completedAt: -1 });

export const SubscriptionPaymentModel: Model<SubscriptionPayment> =
  (mongoose.models.SubscriptionPayment as Model<SubscriptionPayment> | undefined)
  ?? model<SubscriptionPayment>('SubscriptionPayment', subscriptionPaymentSchema);
