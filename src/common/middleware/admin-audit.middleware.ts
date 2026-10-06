import type { NextFunction, Request, Response } from 'express';

import { UserRole } from '../enums/user-role.enum.js';
import { AdminAuditService } from '../../modules/admin-audit/admin-audit.service.js';

const auditedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const staffRoles = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.MODERATOR,
  UserRole.SUPPORT,
  UserRole.FINANCE,
]);
const sensitiveKeys = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'clientSecret',
  'stripeSecretKey',
  'webhookSecret',
]);

export function adminAuditMiddleware(request: Request, response: Response, next: NextFunction): void {
  if (!request.user || !staffRoles.has(request.user.role) || !auditedMethods.has(request.method)) {
    next();
    return;
  }

  const startedAt = Date.now();
  const user = request.user;

  response.on('finish', () => {
    const targetId = getTargetId(request);
    const auditData: {
      adminId: string;
      action: string;
      resource: string;
      targetId?: string;
      details: Record<string, unknown>;
      ipAddress?: string;
    } = {
      adminId: user.userId,
      action: `${request.method} ${request.baseUrl}${request.route?.path ? String(request.route.path) : request.path}`,
      resource: getResourceName(request.baseUrl || request.path),
      details: {
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        succeeded: response.statusCode < 400,
        durationMs: Date.now() - startedAt,
        params: request.params,
        query: request.query,
        body: redactValue(request.body),
      },
    };

    if (targetId) auditData.targetId = targetId;
    if (request.ip) auditData.ipAddress = request.ip;

    void AdminAuditService.logAction(auditData);
  });

  next();
}

function getResourceName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const adminIndex = parts.indexOf('admin');

  const adminResource = parts[adminIndex + 1];
  if (adminIndex >= 0 && adminResource) {
    return adminResource;
  }

  return parts.at(0) ?? 'admin';
}

function getTargetId(request: Request): string | undefined {
  const possibleKeys = ['id', 'userId', 'creatorId', 'requestId', 'planId', 'packageId', 'giftId', 'campaignId'];

  for (const key of possibleKeys) {
    const value = request.params[key];
    if (typeof value === 'string' && value) return value;
  }

  return undefined;
}

function redactValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      sensitiveKeys.has(key) ? '[REDACTED]' : redactValue(entry),
    ]),
  );
}
