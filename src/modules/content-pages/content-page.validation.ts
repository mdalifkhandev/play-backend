import { z } from 'zod';

import { ContentPageStatus, ContentPageType } from './content-page.constants.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid resource identifier.');
const pageTypeSchema = z.enum(ContentPageType);

const sectionSchema = z.object({
  heading: z.string().trim().min(1, 'Section heading is required.').max(160),
  content: z.string().trim().min(1, 'Section content is required.').max(20_000),
  order: z.coerce.number().int().min(0).max(1_000),
});

const effectiveAtSchema = z
  .string()
  .datetime({ offset: true, message: 'effectiveAt must be an ISO 8601 date and time.' })
  .transform((value) => new Date(value));

export const createContentPageBodySchema = z.object({
  pageType: pageTypeSchema,
  title: z.string().trim().min(1, 'Title is required.').max(160),
  sections: z.array(sectionSchema).min(1).max(50),
  changeSummary: z.string().trim().max(500).optional(),
  effectiveAt: effectiveAtSchema.optional(),
});

export const updateContentPageBodySchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(160).optional(),
    sections: z.array(sectionSchema).min(1).max(50).optional(),
    changeSummary: z.string().trim().max(500).optional(),
    effectiveAt: effectiveAtSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided.');

export const publishContentPageBodySchema = z.object({
  effectiveAt: effectiveAtSchema.optional(),
});

export const contentPageIdParamsSchema = z.object({ id: objectIdSchema });
export const contentPageTypeParamsSchema = z.object({ pageType: pageTypeSchema });

export const listContentPagesQuerySchema = z.object({
  pageType: pageTypeSchema.optional(),
  status: z.enum(ContentPageStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateContentPageInput = z.infer<typeof createContentPageBodySchema>;
export type UpdateContentPageInput = z.infer<typeof updateContentPageBodySchema>;
export type PublishContentPageInput = z.infer<typeof publishContentPageBodySchema>;
export type ListContentPagesQuery = z.infer<typeof listContentPagesQuerySchema>;
