import { z } from 'zod';

import {
  announcementAudiences,
  announcementPlacements,
  announcementStatuses,
} from './announcement.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');

export const listAnnouncementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(announcementStatuses).optional(),
  })
  .strict();

export const createAnnouncementSchema = {
  body: z
    .object({
      title: z.string().trim().min(1).max(120),
      message: z.string().trim().min(1).max(1000),
      audience: z.enum(announcementAudiences).default('all'),
      placement: z.enum(announcementPlacements).default('notification_tab'),
      priority: z.coerce.number().int().min(0).max(100).optional().default(0),
      startsAt: z.coerce.date().optional(),
      endsAt: z.coerce.date().optional(),
      schedule: z.boolean().optional().default(false),
      scheduledFor: z.coerce.date().optional(),
    })
    .strict(),
};

export const updateAnnouncementSchema = {
  params: z.object({
    announcementId: objectIdSchema,
  }),
  body: z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      message: z.string().trim().min(1).max(1000).optional(),
      audience: z.enum(announcementAudiences).optional(),
      placement: z.enum(announcementPlacements).optional(),
      priority: z.coerce.number().int().min(0).max(100).optional(),
      startsAt: z.coerce.date().nullable().optional(),
      endsAt: z.coerce.date().nullable().optional(),
      status: z.enum(announcementStatuses).optional(),
      scheduledFor: z.coerce.date().nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one announcement field is required.',
    }),
};

export const announcementParamsSchema = {
  params: z.object({
    announcementId: objectIdSchema,
  }),
};

export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema.body>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema.body>;
