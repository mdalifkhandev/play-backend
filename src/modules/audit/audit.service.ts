import { logger } from '../../infrastructure/logger/logger.js';
import { auditRepository, type CreateAuditLogInput } from './audit.repository.js';

export class AuditService {
  async record(input: CreateAuditLogInput): Promise<void> {
    try {
      await auditRepository.create(input);
    } catch (error) {
      logger.error(
        { err: error, action: input.action, requestId: input.requestId },
        'Audit log write failed',
      );
    }
  }
}

export const auditService = new AuditService();
