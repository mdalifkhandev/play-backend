import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { AdminAuditService } from './admin-audit.service.js';

export const adminAuditController = {
  async list(request: Request, response: Response): Promise<void> {
    const page = parsePositiveInt(request.query.page, 1);
    const limit = Math.min(parsePositiveInt(request.query.limit, 50), 100);
    const filters: { adminId?: string; resource?: string; action?: string } = {};
    const adminId = getStringQuery(request.query.adminId);
    const resource = getStringQuery(request.query.resource);
    const action = getStringQuery(request.query.action);

    if (adminId) filters.adminId = adminId;
    if (resource) filters.resource = resource;
    if (action) filters.action = action;

    const data = await AdminAuditService.getLogs(page, limit, filters);
    sendSuccess(response, 200, 'Admin audit logs retrieved.', data);
  },
};

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getStringQuery(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
