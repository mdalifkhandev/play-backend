import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const notificationTypes = ['like', 'comment', 'follow', 'chat_message', 'milestone', 'system'] as const;
export type NotificationType = (typeof notificationTypes)[number];

export interface Notification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  actorId?: Types.ObjectId;
  type: NotificationType;
  title?: string;
  body?: string;
  relatedEntityId?: Types.ObjectId;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;

const notificationSchema = new Schema<Notification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: notificationTypes, required: true },
    title: { type: String, trim: true, maxlength: 200 },
    body: { type: String, trim: true, maxlength: 1000 },
    relatedEntityId: { type: Schema.Types.ObjectId },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index(
  { userId: 1, isRead: 1, createdAt: -1 },
  { name: 'ix_notifications_user_read_created' },
);

export const NotificationModel: Model<Notification> =
  (mongoose.models.Notification as Model<Notification> | undefined) ??
  model<Notification>('Notification', notificationSchema);
