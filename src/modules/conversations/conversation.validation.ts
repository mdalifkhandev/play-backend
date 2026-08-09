import { z } from 'zod';

export const createConversationSchema = z.object({
  targetUserId: z.string().length(24, 'Invalid user identifier.'),
});

export const sendMessageSchema = z
  .object({
    text: z.string().trim().max(2000, 'Message cannot exceed 2000 characters.').optional(),
    mediaUrl: z.string().url('Invalid media URL.').optional(),
  })
  .refine((data) => Boolean(data.text || data.mediaUrl), {
    message: 'Either text or mediaUrl is required.',
  });

export const conversationIdParamSchema = z.object({
  id: z.string().length(24, 'Invalid conversation identifier.'),
});

export const targetUserIdParamSchema = z.object({
  targetUserId: z.string().length(24, 'Invalid user identifier.'),
});

export const getMessagesQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 30)),
});
