import type { Request, Response } from 'express';

import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { ModerationTargetType } from './moderation-report.model.js';
import { moderationService } from './moderation.service.js';
import type {
  AdminModerationActionInput,
  AdminListModerationReportsQuery,
  CreateModerationReportInput,
  ModerationReportParams,
  ReportTargetParams,
} from './moderation.validation.js';

import { AdminAuditService } from '../admin-audit/admin-audit.service.js';

export class ModerationController {
  report = (targetType: ModerationTargetType) =>
    asyncHandler(async (request: Request, response: Response) => {
      const { targetId } = request.params as ReportTargetParams;
      const { reason, details } = request.body as CreateModerationReportInput;
      const result = await moderationService.report(targetType, targetId, userId(request), reason, details);

      return sendSuccess(
        response,
        result.reported ? 201 : 200,
        result.reported ? 'Report submitted successfully.' : 'You already reported this content.',
        result,
      );
    });

  listForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await moderationService.listForAdmin(request.query as unknown as AdminListModerationReportsQuery);
    return sendSuccess(response, 200, 'Moderation reports retrieved successfully.', result);
  });

  review = asyncHandler(async (request: Request, response: Response) => {
    const { reportId } = request.params as ModerationReportParams;
    const { action, reason } = request.body as AdminModerationActionInput;
    const adminId = userId(request);
    const result = await moderationService.review(reportId, adminId, action, reason);

    await AdminAuditService.logAction({
      adminId,
      action: `moderation_${action}`,
      resource: 'moderation_report',
      targetId: reportId,
      ...(reason ? { details: { reason } } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    });

    return sendSuccess(response, 200, 'Moderation action completed successfully.', result);
  });
}

function userId(request: Request): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication is required.', { code: 'AUTHENTICATION_REQUIRED' });
  }

  return request.user.userId;
}

export const moderationController = new ModerationController();
