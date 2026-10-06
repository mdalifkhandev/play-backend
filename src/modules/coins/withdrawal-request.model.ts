import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export type WithdrawalStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'rejected' | 'failed';

export interface WithdrawalRequest {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  stripeConnectAccountId: string;
  withdrawalType: 'earnings';
  coins?: number;
  coinsPerDollar?: number;
  amountUsd: number;
  currency: string;
  status: WithdrawalStatus;
  stripeTransferId?: string;
  failureReason?: string;
  adminNotes?: string;
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type WithdrawalRequestDocument = HydratedDocument<WithdrawalRequest>;

const withdrawalRequestSchema = new Schema<WithdrawalRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    stripeConnectAccountId: { type: String, required: true, trim: true },
    withdrawalType: { type: String, enum: ['earnings'], default: 'earnings', required: true, index: true },
    coins: { type: Number, min: 0 },
    coinsPerDollar: { type: Number, min: 0 },
    amountUsd: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, default: 'usd', lowercase: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'processing', 'completed', 'rejected', 'failed'],
      default: 'pending',
      index: true,
    },
    stripeTransferId: { type: String, trim: true, index: true },
    failureReason: { type: String, trim: true, maxlength: 700 },
    adminNotes: { type: String, trim: true, maxlength: 500 },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ userId: 1, createdAt: -1 });
withdrawalRequestSchema.index(
  { userId: 1, status: 1, createdAt: -1 },
  { name: 'ix_withdrawals_user_status_created' },
);

export const WithdrawalRequestModel: Model<WithdrawalRequest> =
  (mongoose.models.WithdrawalRequest as Model<WithdrawalRequest> | undefined) ??
  model<WithdrawalRequest>('WithdrawalRequest', withdrawalRequestSchema);
