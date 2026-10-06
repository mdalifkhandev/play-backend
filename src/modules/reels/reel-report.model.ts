import mongoose, { Schema, model, type Model, type Types } from 'mongoose';

export enum ReelReportReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  VIOLENCE = 'violence',
  NUDITY = 'nudity',
  FALSE_INFORMATION = 'false_information',
  COPYRIGHT = 'copyright',
  OTHER = 'other',
}

export interface ReelReport {
  _id: Types.ObjectId;
  reelId: Types.ObjectId;
  reporterId: Types.ObjectId;
  reason: ReelReportReason;
  details?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reelReportSchema = new Schema<ReelReport>(
  {
    reelId: { type: Schema.Types.ObjectId, ref: 'Reel', required: true },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: Object.values(ReelReportReason), required: true },
    details: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

reelReportSchema.index(
  { reelId: 1, reporterId: 1 },
  { unique: true, name: 'uq_reel_reports_reel_reporter' },
);
reelReportSchema.index(
  { reporterId: 1, createdAt: -1 },
  { name: 'ix_reel_reports_reporter_created_at' },
);

export const ReelReportModel: Model<ReelReport> =
  (mongoose.models.ReelReport as Model<ReelReport> | undefined) ??
  model<ReelReport>('ReelReport', reelReportSchema);
