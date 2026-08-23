import { z } from 'zod';

import {
  moderationReportActions,
  moderationReportReasons,
  moderationReportStatuses,
  moderationTargetTypes,
} from './moderation-report.model.js';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');

export const reportTargetParamsSchema = z.object({ targetId: objectIdSchema }).strict();
export const moderationReportParamsSchema = z.object({ reportId: objectIdSchema }).strict();

export const createModerationReportBodySchema = z
  .object({
    reason: z.enum(moderationReportReasons),
    details: z.string().trim().max(500).optional(),
  })
  .strict();

export const adminListModerationReportsQuerySchema = z
  .object({
    targetType: z.enum(moderationTargetTypes).optional(),
    status: z.enum(moderationReportStatuses).optional().default('pending'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const adminModerationActionBodySchema = z
  .object({
    action: z.enum(moderationReportActions),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type ReportTargetParams = z.infer<typeof reportTargetParamsSchema>;
export type ModerationReportParams = z.infer<typeof moderationReportParamsSchema>;
export type CreateModerationReportInput = z.infer<typeof createModerationReportBodySchema>;
export type AdminListModerationReportsQuery = z.infer<typeof adminListModerationReportsQuerySchema>;
export type AdminModerationActionInput = z.infer<typeof adminModerationActionBodySchema>;
