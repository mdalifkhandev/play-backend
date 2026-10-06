import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const announcementAudiences = ['all', 'creators', 'premium'] as const;
export type AnnouncementAudience = (typeof announcementAudiences)[number];

export const announcementPlacements = [
  'home_banner',
  'notification_tab',
  'inbox_notice',
  'profile_notice',
  'live_notice',
  'login_notice',
  'maintenance',
] as const;
export type AnnouncementPlacement = (typeof announcementPlacements)[number];

export const announcementStatuses = ['draft', 'scheduled', 'active', 'expired', 'paused'] as const;
export type AnnouncementStatus = (typeof announcementStatuses)[number];

export interface Announcement {
  _id: Types.ObjectId;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  placement: AnnouncementPlacement;
  status: AnnouncementStatus;
  priority: number;
  startsAt?: Date;
  endsAt?: Date;
  scheduledFor?: Date;
  sentAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AnnouncementDocument = HydratedDocument<Announcement>;

const announcementSchema = new Schema<Announcement>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    audience: { type: String, enum: announcementAudiences, required: true, default: 'all', index: true },
    placement: {
      type: String,
      enum: announcementPlacements,
      required: true,
      default: 'notification_tab',
      index: true,
    },
    status: { type: String, enum: announcementStatuses, required: true, default: 'active', index: true },
    priority: { type: Number, required: true, default: 0, min: 0, max: 100 },
    startsAt: { type: Date },
    endsAt: { type: Date },
    scheduledFor: { type: Date },
    sentAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

announcementSchema.index({ status: 1, createdAt: -1 });
announcementSchema.index({ audience: 1, status: 1, createdAt: -1 });
announcementSchema.index({ placement: 1, status: 1, priority: -1, createdAt: -1 });

export const AnnouncementModel: Model<Announcement> =
  (mongoose.models.Announcement as Model<Announcement> | undefined) ??
  model<Announcement>('Announcement', announcementSchema);
