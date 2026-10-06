import { z } from 'zod';

import { MediaAssetPurpose, MediaType } from './media-asset.constants.js';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid upload identifier.');

/**
 * Frontend-friendly upload-url contract.
 * Maps to the secure prepare flow: purpose=reel, mediaType=video/image.
 */
export const mediaUploadUrlBodySchema = z
  .object({
    fileName: z.string().trim().min(1).max(255).optional(),
    contentType: z.string().trim().toLowerCase().min(1).max(100).optional(),
    mimeType: z.string().trim().toLowerCase().min(1).max(100).optional(),
    fileSize: z.coerce.number().int().positive().optional(),
    fileSizeBytes: z.coerce.number().int().positive().optional(),
    mediaType: z.enum([MediaType.VIDEO, MediaType.IMAGE]).default(MediaType.VIDEO),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.contentType && !value.mimeType) {
      context.addIssue({
        code: 'custom',
        path: ['contentType'],
        message: 'contentType or mimeType is required.',
      });
    }

    if (value.fileSize === undefined && value.fileSizeBytes === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['fileSize'],
        message: 'fileSize or fileSizeBytes is required.',
      });
    }
  })
  .transform((value) => ({
    fileName: value.fileName,
    mediaType: value.mediaType,
    mimeType: (value.contentType ?? value.mimeType)!,
    fileSizeBytes: (value.fileSize ?? value.fileSizeBytes)!,
    purpose: MediaAssetPurpose.REEL,
  }));

export const mediaCompleteBodySchema = z
  .object({
    uploadId: objectIdSchema.optional(),
    mediaKey: z.string().trim().min(1).max(500).optional(),
    /** Optional duration from Cloudinary direct-upload response (seconds). */
    duration: z.coerce.number().positive().max(3_600).optional(),
    durationSeconds: z.coerce.number().positive().max(3_600).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.uploadId && !value.mediaKey) {
      context.addIssue({
        code: 'custom',
        path: ['uploadId'],
        message: 'uploadId or mediaKey is required.',
      });
    }
  })
  .transform((value) => ({
    uploadId: value.uploadId,
    mediaKey: value.mediaKey,
    durationSeconds: value.durationSeconds ?? value.duration,
  }));

export type MediaUploadUrlInput = z.infer<typeof mediaUploadUrlBodySchema>;
export type MediaCompleteInput = z.infer<typeof mediaCompleteBodySchema>;
