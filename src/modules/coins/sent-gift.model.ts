import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export type GiftTargetType = 'reel' | 'live-stream' | 'story';

export interface SentGift {
  _id: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  targetType: GiftTargetType;
  targetId: mongoose.Types.ObjectId;
  giftId: mongoose.Types.ObjectId;
  giftName: string;
  coinPrice: number;
  quantity: number;
  totalCoins: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SentGiftDocument = HydratedDocument<SentGift>;

const sentGiftSchema = new Schema<SentGift>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: {
      type: String,
      required: true,
      enum: ['reel', 'live-stream', 'story'],
      index: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    giftId: { type: Schema.Types.ObjectId, ref: 'GiftCatalog', required: true },
    giftName: { type: String, required: true, trim: true },
    coinPrice: { type: Number, required: true, min: 1 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    totalCoins: { type: Number, required: true, min: 1 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

sentGiftSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
sentGiftSchema.index({ senderId: 1, createdAt: -1 });
sentGiftSchema.index({ recipientId: 1, createdAt: -1 });

export const SentGiftModel: Model<SentGift> =
  (mongoose.models.SentGift as Model<SentGift> | undefined) ??
  model<SentGift>('SentGift', sentGiftSchema);
