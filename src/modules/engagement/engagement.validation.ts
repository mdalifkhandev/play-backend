import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');

export const reelIdParamsSchema = z.object({ reelId: objectIdSchema }).strict();

export const commentIdParamsSchema = z.object({ commentId: objectIdSchema }).strict();

export const reelCommentParamsSchema = z
  .object({ reelId: objectIdSchema, commentId: objectIdSchema.optional() })
  .strict();

export const shareBodySchema = z
  .object({
    channel: z.enum(['profile', 'copy_link', 'whatsapp', 'facebook', 'messenger', 'other']).default('copy_link'),
  })
  .strict();

export const createCommentBodySchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Comment text is required.')
      .max(1_000, 'Comment must be 1000 characters or fewer.')
      .transform((value) =>
        value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''),
      ),
    parentCommentId: objectIdSchema.optional(),
  })
  .strict();

export const editCommentBodySchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .transform((value) =>
        value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''),
      ),
  })
  .strict();

export const commentFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export const savedFeedQuerySchema = z
  .object({
    type: z.enum(['reel']).default('reel'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type ShareInput = z.infer<typeof shareBodySchema>;
export type CreateCommentInput = z.infer<typeof createCommentBodySchema>;
export type EditCommentInput = z.infer<typeof editCommentBodySchema>;
export type CommentFeedQuery = z.infer<typeof commentFeedQuerySchema>;
export type SavedFeedQuery = z.infer<typeof savedFeedQuerySchema>;
