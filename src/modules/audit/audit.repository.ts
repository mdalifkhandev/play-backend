import { AuditLogModel, type AuditLogDocument } from './audit-log.model.js';

export interface CreateAuditLogInput {
  actorUserId?: string;
  action: string;
  outcome: 'success' | 'failure';
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
}

export class AuditRepository {
  async create(input: CreateAuditLogInput): Promise<AuditLogDocument> {
    return AuditLogModel.create(input);
  }
}

export const auditRepository = new AuditRepository();
