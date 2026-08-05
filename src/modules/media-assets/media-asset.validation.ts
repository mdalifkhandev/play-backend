import { z } from 'zod';

import { MediaAssetPurpose, MediaType } from './media-asset.constants.js';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid upload identifier.');

export const prepareUploadBodySchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .transform((value) => (value ? sanitizeFileName(value) : undefined)),
    mediaType: z.enum(MediaType),
    mimeType: z.string().trim().toLowerCase().min(1).max(100),
    fileSizeBytes: z.coerce.number().int().positive(),
    purpose: z.enum(MediaAssetPurpose).default(MediaAssetPurpose.STORY),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.purpose === MediaAssetPurpose.REEL && value.mediaType !== MediaType.VIDEO) {
      context.addIssue({
        code: 'custom',
        path: ['mediaType'],
        message: 'Reel uploads require mediaType video.',
      });
    }
  });

export const completeUploadBodySchema = z
  .object({
    uploadId: objectIdSchema,
  })
  .strict();

export const uploadIdParamsSchema = z
  .object({
    uploadId: objectIdSchema,
  })
  .strict();

export type PrepareUploadInput = z.infer<typeof prepareUploadBodySchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadBodySchema>;

function sanitizeFileName(fileName: string): string {
  const baseName = fileName.replace(/[/\\]/g, '_').replace(/[^\w.\- ()[\]]+/g, '_');
  return baseName.slice(0, 255) || 'upload.bin';
}
