import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const adEventTypes = ['impression', 'click'] as const;
export type AdEventType = (typeof adEventTypes)[number];

export interface AdEvent {
  _id: Types.ObjectId;
  adId: Types.ObjectId;
  type: AdEventType;
  userId?: Types.ObjectId;
  anonymousKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AdEventDocument = HydratedDocument<AdEvent>;

const adEventSchema = new Schema<AdEvent>(
  {
    adId: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    type: { type: String, enum: adEventTypes, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    anonymousKey: { type: String, trim: true, maxlength: 120, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adEventSchema.index(
  { adId: 1, type: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $exists: true } },
    name: 'ux_ad_event_ad_type_user',
  },
);

adEventSchema.index(
  { adId: 1, type: 1, anonymousKey: 1 },
  {
    unique: true,
    partialFilterExpression: { anonymousKey: { $exists: true } },
    name: 'ux_ad_event_ad_type_anonymous',
  },
);

export const AdEventModel: Model<AdEvent> = model<AdEvent>('AdEvent', adEventSchema);
