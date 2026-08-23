import mongoose, { Schema, model, type Model, type Types } from 'mongoose';

export const moderationTargetTypes = ['reel', 'comment', 'user', 'profile'] as const;
export type ModerationTargetType = (typeof moderationTargetTypes)[number];

export const moderationReportStatuses = ['pending', 'resolved', 'rejected'] as const;
export type ModerationReportStatus = (typeof moderationReportStatuses)[number];

export const moderationReportActions = ['none', 'keep', 'remove', 'warn', 'suspend', 'ban'] as const;
export type ModerationReportAction = (typeof moderationReportActions)[number];

export const moderationReportReasons = [
  'spam',
  'harassment',
  'hate_speech',
  'violence',
  'nudity',
  'false_information',
  'copyright',
  'impersonation',
  'scam',
  'other',
] as const;
export type ModerationReportReason = (typeof moderationReportReasons)[number];

export interface ModerationReport {
  _id: Types.ObjectId;
  targetType: ModerationTargetType;
  targetId: Types.ObjectId;
  ownerId?: Types.ObjectId;
  reporterId: Types.ObjectId;
  reason: ModerationReportReason;
  details?: string;
  status: ModerationReportStatus;
  action: ModerationReportAction;
  adminReason?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const moderationReportSchema = new Schema<ModerationReport>(
  {
    targetType: { type: String, enum: moderationTargetTypes, required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, enum: moderationReportReasons, required: true },
    details: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: moderationReportStatuses, default: 'pending', required: true, index: true },
    action: { type: String, enum: moderationReportActions, default: 'none', required: true },
    adminReason: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

moderationReportSchema.index(
  { targetType: 1, targetId: 1, reporterId: 1 },
  { unique: true, name: 'uq_moderation_reports_target_reporter' },
);
moderationReportSchema.index(
  { status: 1, targetType: 1, createdAt: -1 },
  { name: 'ix_moderation_reports_admin_queue' },
);

export const ModerationReportModel: Model<ModerationReport> =
  (mongoose.models.ModerationReport as Model<ModerationReport> | undefined) ??
  model<ModerationReport>('ModerationReport', moderationReportSchema);
