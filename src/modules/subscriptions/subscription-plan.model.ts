import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface SubscriptionPlan {
  _id: mongoose.Types.ObjectId;
  planId: string;
  name: string;
  interval: 'month' | 'year' | 'lifetime';
  price: number;
  currency: 'usd';
  discountLabel?: string;
  productIdentifier?: string;
  features: string[];
  isActive: boolean;
  isDeleted: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionPlanDocument = HydratedDocument<SubscriptionPlan>;

export interface SubscriptionPlanSeedState {
  _id: string;
  seededAt: Date;
  updatedAt: Date;
}

const subscriptionPlanSchema = new Schema<SubscriptionPlan>(
  {
    planId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 60,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    interval: { type: String, enum: ['month', 'year', 'lifetime'], required: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['usd'], default: 'usd', required: true },
    discountLabel: { type: String, trim: true, maxlength: 40 },
    productIdentifier: { type: String, trim: true, maxlength: 200 },
    features: { type: [String], default: [], validate: { validator: (items: string[]) => items.length <= 20 } },
    isActive: { type: Boolean, default: true, required: true, index: true },
    isDeleted: { type: Boolean, default: false, required: true },
    sortOrder: { type: Number, default: 0, required: true },
  },
  { timestamps: true, versionKey: false },
);

subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });

export const SubscriptionPlanModel: Model<SubscriptionPlan> =
  (mongoose.models.SubscriptionPlan as Model<SubscriptionPlan> | undefined)
  ?? model<SubscriptionPlan>('SubscriptionPlan', subscriptionPlanSchema);

const subscriptionPlanSeedStateSchema = new Schema<SubscriptionPlanSeedState>(
  {
    _id: { type: String, required: true },
    seededAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
);

export const SubscriptionPlanSeedStateModel: Model<SubscriptionPlanSeedState> =
  (mongoose.models.SubscriptionPlanSeedState as Model<SubscriptionPlanSeedState> | undefined)
  ?? model<SubscriptionPlanSeedState>('SubscriptionPlanSeedState', subscriptionPlanSeedStateSchema);
