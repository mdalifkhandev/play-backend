import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface ReelView {
  _id: Types.ObjectId;
  reelId: Types.ObjectId;
  viewerId: Types.ObjectId;
  viewedAt: Date;
}

export type ReelViewDocument = HydratedDocument<ReelView>;

const reelViewSchema = new Schema<ReelView>(
  {
    reelId: { type: Schema.Types.ObjectId, ref: 'Reel', required: true },
    viewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false },
);

reelViewSchema.index(
  { reelId: 1, viewerId: 1 },
  { unique: true, name: 'uq_reel_views_reel_viewer' },
);
reelViewSchema.index(
  { reelId: 1, viewedAt: -1 },
  { name: 'ix_reel_views_reel_viewed_at' },
);
reelViewSchema.index(
  { viewerId: 1, viewedAt: -1 },
  { name: 'ix_reel_views_viewer_viewed_at' },
);

export const ReelViewModel: Model<ReelView> =
  (mongoose.models.ReelView as Model<ReelView> | undefined) ??
  model<ReelView>('ReelView', reelViewSchema);
