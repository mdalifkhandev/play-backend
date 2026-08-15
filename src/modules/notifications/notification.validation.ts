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
    userId: z.string().length(24, 'Invalid user identifier.'),
  })
  .strict();

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenBodySchema>;
export type DeletePushTokenInput = z.infer<typeof deletePushTokenBodySchema>;
export type SendPushNotificationInput = z.infer<typeof sendPushNotificationBodySchema>;
export type AdminSendPushNotificationInput = z.infer<typeof adminSendPushNotificationBodySchema>;

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
