import { AdminAuditLogModel } from './admin-audit.model.js';
import { logger } from '../../infrastructure/logger/logger.js';

export class AdminAuditService {
  /**
   * Logs an administrative action
   */
  static async logAction(data: {
    adminId: string;
    action: string;
    resource: string;
    targetId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await AdminAuditLogModel.create(data);
    } catch (error) {
      logger.error({ err: error, data }, 'Failed to save admin audit log');
    }
  }

  /**
   * Retrieves recent audit logs
   */
  static async getLogs(
    page = 1,
    limit = 50,
    filters?: { adminId?: string; resource?: string; action?: string },
  ) {
    const query: Record<string, unknown> = {};
    if (filters?.adminId) query.adminId = filters.adminId;
    if (filters?.resource) query.resource = filters.resource;
    if (filters?.action) query.action = filters.action;

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AdminAuditLogModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adminId', 'email profile.displayName role')
        .lean(),
      AdminAuditLogModel.countDocuments(query),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
