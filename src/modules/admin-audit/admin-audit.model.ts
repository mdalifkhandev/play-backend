import { Schema, model, type Document, Types } from 'mongoose';

export interface AdminAuditLog extends Document {
  adminId: Types.ObjectId;
  action: string;
  resource: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminAuditLogSchema = new Schema<AdminAuditLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    targetId: { type: String },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  {
    timestamps: true,
  },
);

adminAuditLogSchema.index({ adminId: 1 });
adminAuditLogSchema.index({ resource: 1, action: 1 });
adminAuditLogSchema.index({ createdAt: -1 });

export const AdminAuditLogModel = model<AdminAuditLog>('AdminAuditLog', adminAuditLogSchema);
