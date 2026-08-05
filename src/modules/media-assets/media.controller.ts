import type { Request, Response } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { mediaAssetRepository } from './media-asset.repository.js';
import { mediaAssetService } from './media-asset.service.js';
import type { MediaCompleteInput, MediaUploadUrlInput } from './media.validation.js';

/**
 * Frontend contract adapters for:
 * POST /api/v1/media/upload-url
 * POST /api/v1/media/complete
 */
export class MediaController {
  uploadUrl = asyncHandler(async (request: Request, response: Response) => {
    const input = request.body as MediaUploadUrlInput;
    const prepared = await mediaAssetService.prepare(request.user!.userId, input);

    return sendSuccess(response, 201, 'Upload URL prepared successfully.', {
      uploadUrl: prepared.uploadUrl,
      mediaKey: prepared.publicId,
      uploadId: prepared.uploadId,
      publicUrl: null,
      provider: prepared.provider,
      cloudName: prepared.cloudName,
      apiKey: prepared.apiKey,
      timestamp: prepared.timestamp,
      signature: prepared.signature,
      publicId: prepared.publicId,
      resourceType: prepared.resourceType,
      overwrite: prepared.overwrite,
      expiresAt: prepared.expiresAt,
      purpose: prepared.purpose,
    });
  });

  complete = asyncHandler(async (request: Request, response: Response) => {
    const body = request.body as MediaCompleteInput;
    const ownerId = request.user!.userId;
    let uploadId = body.uploadId;
    let mediaKey = body.mediaKey;

    if (!uploadId && mediaKey) {
      const asset = await mediaAssetRepository.findByPublicId(mediaKey);

      if (!asset) {
        throw new NotFoundError('Upload was not found.', { code: 'UPLOAD_NOT_FOUND' });
      }

      if (asset.ownerId.toString() !== ownerId) {
        throw new ForbiddenError('This upload belongs to another user.', {
          code: 'UPLOAD_NOT_OWNED',
        });
      }

      uploadId = asset._id.toString();
    }

    if (!uploadId) {
      throw new AppError('uploadId or mediaKey is required.', 400, {
        code: 'VALIDATION_ERROR',
      });
    }

    const verified = await mediaAssetService.complete(ownerId, uploadId);
    const asset = await mediaAssetRepository.findById(verified.id);

    return sendSuccess(response, 200, 'Upload verified successfully.', {
      uploadId: verified.id,
      mediaAssetId: verified.id,
      mediaKey: asset?.publicId ?? mediaKey ?? null,
      publicUrl: verified.secureUrl,
      uploadStatus: verified.uploadStatus,
      durationMs: verified.durationMs,
      width: verified.width,
      height: verified.height,
      fileSizeBytes: verified.fileSizeBytes,
      mimeType: verified.mimeType,
      purpose: verified.purpose,
      expiresAt: verified.expiresAt,
    });
  });
}

export const mediaController = new MediaController();
