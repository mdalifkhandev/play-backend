import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface MonetizationSetting {
  _id: mongoose.Types.ObjectId;
  creatorSharePercent: number;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type MonetizationSettingDocument = HydratedDocument<MonetizationSetting>;

const monetizationSettingSchema = new Schema<MonetizationSetting>(
  {
    creatorSharePercent: { type: Number, required: true, default: 60, min: 0, max: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const MonetizationSettingModel: Model<MonetizationSetting> =
  (mongoose.models.MonetizationSetting as Model<MonetizationSetting> | undefined) ??
  model<MonetizationSetting>('MonetizationSetting', monetizationSettingSchema);
