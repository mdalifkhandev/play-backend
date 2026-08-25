import { z } from 'zod';

import { pushTokenPlatforms } from './notification-token.model.js';

export const registerPushTokenBodySchema = z
  .object({
    token: z.string().trim().min(10).max(4096),
    platform: z.enum(pushTokenPlatforms),
    deviceId: z.string().trim().min(1).max(200).optional(),
    appVersion: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const deletePushTokenBodySchema = z
  .object({
    token: z.string().trim().min(10).max(4096),
  })
  .strict();

const pushNotificationPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(500),
    imageUrl: z.string().trim().url().optional(),
    data: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const sendPushNotificationBodySchema = pushNotificationPayloadSchema;

export const adminSendPushNotificationBodySchema = pushNotificationPayloadSchema
  .extend({
    userId: z.string().length(24, 'Invalid user identifier.').optional(),
    audience: z
      .enum(['all', 'specific_user', 'creators', 'premium', 'kids', 'active_users'])
      .default('specific_user'),
    notificationType: z.enum(['system', 'follow', 'like', 'comment', 'chat_message', 'milestone']).default('system'),
    deepLink: z.string().trim().max(500).optional(),
    schedule: z.boolean().optional().default(false),
    scheduledFor: z.coerce.date().optional(),
  })
  .refine((value) => value.audience !== 'specific_user' || Boolean(value.userId), {
    message: 'User id is required for a specific user notification.',
    path: ['userId'],
  })
  .strict();

export const adminNotificationHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const adminNotificationParamsSchema = {
  params: z.object({
    notificationId: z.string().length(24, 'Invalid notification identifier.'),
  }),
};

export const adminUpdateNotificationBodySchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    body: z.string().trim().min(1).max(500).optional(),
    notificationType: z.enum(['system', 'follow', 'like', 'comment', 'chat_message', 'milestone']).optional(),
    deepLink: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one notification field is required.',
  });

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenBodySchema>;
export type DeletePushTokenInput = z.infer<typeof deletePushTokenBodySchema>;
export type SendPushNotificationInput = z.infer<typeof sendPushNotificationBodySchema>;
export type AdminSendPushNotificationInput = z.infer<typeof adminSendPushNotificationBodySchema>;
export type AdminNotificationHistoryQuery = z.infer<typeof adminNotificationHistoryQuerySchema>;
export type AdminUpdateNotificationInput = z.infer<typeof adminUpdateNotificationBodySchema>;

export const getNotificationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.coerce.date().optional(),
  })
  .strict();

export const markNotificationsAsReadBodySchema = z
  .object({
    notificationIds: z.array(z.string().length(24, 'Invalid identifier')).max(100).optional(),
  })
  .strict();

export type GetNotificationsQuery = z.infer<typeof getNotificationsQuerySchema>;
export type MarkNotificationsAsReadInput = z.infer<typeof markNotificationsAsReadBodySchema>;
