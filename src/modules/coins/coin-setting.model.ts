import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface CoinSetting {
  _id: mongoose.Types.ObjectId;
  coinsPerDollar: number;
  minWithdrawalCoins: number;
  maxWithdrawalCoins: number;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type CoinSettingDocument = HydratedDocument<CoinSetting>;

const coinSettingSchema = new Schema<CoinSetting>(
  {
    coinsPerDollar: { type: Number, required: true, default: 100, min: 1 },
    minWithdrawalCoins: { type: Number, required: true, default: 1000, min: 1 },
    maxWithdrawalCoins: { type: Number, required: true, default: 500000, min: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const CoinSettingModel: Model<CoinSetting> =
  (mongoose.models.CoinSetting as Model<CoinSetting> | undefined) ??
  model<CoinSetting>('CoinSetting', coinSettingSchema);
