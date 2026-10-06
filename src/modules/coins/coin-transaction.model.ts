import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export type CoinTransactionStatus = 'pending' | 'completed' | 'failed' | 'canceled';

export interface CoinTransaction {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  packageId?: mongoose.Types.ObjectId;
  coins: number;
  amount: number;
  currency: string;
  paymentProvider: 'stripe' | 'diamond_conversion';
  stripePaymentIntentId?: string;
  stripeClientSecret?: string;
  status: CoinTransactionStatus;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type CoinTransactionDocument = HydratedDocument<CoinTransaction>;

const coinTransactionSchema = new Schema<CoinTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'CoinPackage' },
    coins: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'usd', lowercase: true, trim: true },
    paymentProvider: { type: String, required: true, default: 'stripe', enum: ['stripe', 'diamond_conversion'] },
    stripePaymentIntentId: { type: String, trim: true, index: true },
    stripeClientSecret: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'canceled'],
      default: 'pending',
      index: true,
    },
    completedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

coinTransactionSchema.index({ userId: 1, createdAt: -1 });
coinTransactionSchema.index(
  { userId: 1, status: 1, createdAt: -1 },
  { name: 'ix_coin_transactions_user_status_created' },
);
coinTransactionSchema.index({ stripePaymentIntentId: 1 }, { unique: true, sparse: true });

export const CoinTransactionModel: Model<CoinTransaction> =
  (mongoose.models.CoinTransaction as Model<CoinTransaction> | undefined) ??
  model<CoinTransaction>('CoinTransaction', coinTransactionSchema);
