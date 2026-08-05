import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface StoryView {
  _id: Types.ObjectId;
  storyId: Types.ObjectId;
  viewerId: Types.ObjectId;
  viewedAt: Date;
  expiresAt: Date;
}

export type StoryViewDocument = HydratedDocument<StoryView>;

const storyViewSchema = new Schema<StoryView>(
  {
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
    viewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: Date.now, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

storyViewSchema.index(
  { storyId: 1, viewerId: 1 },
  { unique: true, name: 'uq_story_views_story_viewer' },
);
storyViewSchema.index(
  { storyId: 1, viewedAt: -1 },
  { name: 'ix_story_views_story_viewed_at' },
);
storyViewSchema.index(
  { viewerId: 1, viewedAt: -1 },
  { name: 'ix_story_views_viewer_viewed_at' },
);
storyViewSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'ttl_story_views_expires_at' },
);

export const StoryViewModel: Model<StoryView> =
  (mongoose.models.StoryView as Model<StoryView> | undefined) ??
  model<StoryView>('StoryView', storyViewSchema);
