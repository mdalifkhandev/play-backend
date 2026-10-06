import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface AuditLog {
  _id: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  action: string;
  outcome: 'success' | 'failure';
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

const auditLogSchema = new Schema<AuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, trim: true, index: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true, index: true },
    requestId: { type: String, trim: true, index: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true, maxlength: 500 },
    method: { type: String, trim: true, maxlength: 10 },
    path: { type: String, trim: true, maxlength: 500 },
    statusCode: { type: Number, min: 100, max: 599 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, outcome: 1, createdAt: -1 });

export const AuditLogModel: Model<AuditLog> =
  (mongoose.models.AuditLog as Model<AuditLog> | undefined) ??
  model<AuditLog>('AuditLog', auditLogSchema);
