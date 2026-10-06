import { z } from 'zod';

import {
  SupportCategory,
  SupportPriority,
  SupportRequestStatus,
} from './support-request.constants.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid resource identifier.');

export const createSupportRequestBodySchema = z.object({
  category: z.enum(SupportCategory),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(5_000),
});

export const createSupportMessageBodySchema = z.object({
  message: z.string().trim().min(1).max(5_000),
});

export const supportRequestIdParamsSchema = z.object({ id: objectIdSchema });

export const listMySupportRequestsQuerySchema = z.object({
  status: z.enum(SupportRequestStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listAdminSupportRequestsQuerySchema = listMySupportRequestsQuerySchema.extend({
  category: z.enum(SupportCategory).optional(),
  priority: z.enum(SupportPriority).optional(),
  requesterUserId: objectIdSchema.optional(),
  assignedTo: objectIdSchema.optional(),
});

export const updateSupportRequestBodySchema = z
  .object({
    status: z.enum(SupportRequestStatus).optional(),
    priority: z.enum(SupportPriority).optional(),
    assignedTo: objectIdSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided.');

export type CreateSupportRequestInput = z.infer<typeof createSupportRequestBodySchema>;
export type CreateSupportMessageInput = z.infer<typeof createSupportMessageBodySchema>;
export type ListMySupportRequestsQuery = z.infer<typeof listMySupportRequestsQuerySchema>;
export type ListAdminSupportRequestsQuery = z.infer<typeof listAdminSupportRequestsQuerySchema>;
export type UpdateSupportRequestInput = z.infer<typeof updateSupportRequestBodySchema>;
