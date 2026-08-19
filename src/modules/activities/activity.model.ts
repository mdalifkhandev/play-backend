import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const activityTypes = [
  'like_given',
  'like_received',
  'comment_given',
  'comment_received',
  'video_watched',
  'follow_given',
  'follow_received',
  'message_sent',
  'profile_updated',
  'live_started',
  'live_watched',
  'gift_sent',
  'gift_received',
] as const;
export type ActivityType = (typeof activityTypes)[number];

export const entityModels = ['User', 'Reel', 'Comment', 'Message', 'LiveStream', 'Gift'] as const;
export type EntityModel = (typeof entityModels)[number];

export interface Activity {
  _id: Types.ObjectId;
  userId: Types.ObjectId; // The user who owns this log entry
  actorId?: Types.ObjectId; // The user who performed the action (e.g. who liked your post)
  actionType: ActivityType;
  entityId?: Types.ObjectId;
  entityModel?: EntityModel;
  metadata?: Record<string, any>; // Extra info like thumbnail URLs, text, etc.
  createdAt: Date;
  updatedAt: Date;
}

export type ActivityDocument = HydratedDocument<Activity>;

const activitySchema = new Schema<Activity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actionType: { type: String, enum: activityTypes, required: true },
    entityId: { type: Schema.Types.ObjectId },
    entityModel: { type: String, enum: entityModels },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound index for querying user's activities efficiently
activitySchema.index({ userId: 1, createdAt: -1 });

// TTL index to automatically remove activities after 30 days
// 30 days * 24 hours * 60 minutes * 60 seconds = 2592000 seconds
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const ActivityModel: Model<Activity> =
  (mongoose.models.Activity as Model<Activity> | undefined) ??
  model<Activity>('Activity', activitySchema);
