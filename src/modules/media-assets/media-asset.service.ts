import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { env } from '../../config/env.config.js';
import { runFfprobeSource } from '../../infrastructure/media/ffmpeg.runner.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { cloudinaryStorage, type CloudinaryStorage } from '../../infrastructure/storage/index.js';
import type { StoredAsset } from '../../infrastructure/storage/storage.interface.js';
import {
  CLOUDINARY_FORMAT_MIME_TYPES,
  MediaAssetAttachmentStatus,
  MediaAssetPurpose,
  MediaAssetUploadStatus,
  MediaType,
  REEL_VIDEO_MIME_TYPES,
  STORY_IMAGE_MIME_TYPES,
  STORY_VIDEO_MIME_TYPES,
} from './media-asset.constants.js';
import { toMediaAssetDto, type MediaAssetDto } from './media-asset.mapper.js';
import {
  mediaAssetRepository,
  type MediaAssetRepository,
} from './media-asset.repository.js';
import type { PrepareUploadInput } from './media-asset.validation.js';

const MAX_MEDIA_DIMENSION = 12_000;
const UPLOAD_VERIFY_MAX_ATTEMPTS = 5;
const UPLOAD_VERIFY_RETRY_DELAYS_MS = [500, 1_000, 2_000, 3_000, 4_000] as const;

export interface PreparedUploadDto {
  uploadId: string;
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: MediaType;
  overwrite: false;
  uploadUrl: string;
  expiresAt: string;
  purpose: MediaAssetPurpose;
}

export class MediaAssetService {
  constructor(
    private readonly repository: MediaAssetRepository = mediaAssetRepository,
    private readonly storage: CloudinaryStorage = cloudinaryStorage,
  ) {}

  async prepare(ownerId: string, input: PrepareUploadInput): Promise<PreparedUploadDto> {
    this.validateDeclaredUpload(input);

    const folderSegment =
      input.purpose === MediaAssetPurpose.REEL ? 'reels/raw' : 'stories';
    const publicId = `${env.CLOUDINARY_UPLOAD_FOLDER}/${folderSegment}/${ownerId}/${randomUUID()}`;
    const sessionTtlMinutes =
      input.purpose === MediaAssetPurpose.REEL
        ? env.REEL_UPLOAD_SESSION_TTL_MINUTES
        : env.STORY_UPLOAD_SESSION_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + sessionTtlMinutes * 60 * 1_000);
    const signedUpload = this.storage.createSignedUpload(publicId, input.mediaType);
    const asset = await this.repository.createPending({
      ownerId,
      publicId,
      mediaType: input.mediaType,
      purpose: input.purpose,
      mimeType: input.mimeType,
      declaredFileSizeBytes: input.fileSizeBytes,
      uploadSignatureId: randomUUID(),
      expiresAt,
      ...(input.fileName ? { originalFileName: input.fileName } : {}),
    });

    return {
      uploadId: asset._id.toString(),
      ...signedUpload,
      resourceType: input.mediaType,
      expiresAt: expiresAt.toISOString(),
      purpose: input.purpose,
    };
  }

  async complete(
    ownerId: string,
    uploadId: string,
    hints?: { durationSeconds?: number },
  ): Promise<MediaAssetDto> {
    const asset = await this.repository.findById(uploadId);

    if (!asset) {
      throw new NotFoundError('Upload was not found.', { code: 'UPLOAD_NOT_FOUND' });
    }

    if (asset.ownerId.toString() !== ownerId) {
      throw new ForbiddenError('This upload belongs to another user.', {
        code: 'UPLOAD_NOT_OWNED',
      });
    }

    if (asset.uploadStatus === MediaAssetUploadStatus.VERIFIED) {
      return toMediaAssetDto(asset);
    }

    if (asset.expiresAt.getTime() <= Date.now()) {
      await this.repository.markExpired(uploadId);
      throw new AppError('Upload session has expired.', 410, {
        code: 'UPLOAD_SESSION_EXPIRED',
      });
    }

    if (
      asset.uploadStatus !== MediaAssetUploadStatus.PENDING ||
      asset.attachmentStatus !== MediaAssetAttachmentStatus.UNATTACHED
    ) {
      throw new AppError('Upload cannot be completed in its current state.', 409, {
        code: 'UPLOAD_VERIFICATION_FAILED',
      });
    }

    const storedAsset = await this.resolveStoredAssetForVerification(
      asset.publicId,
      asset.mediaType,
      hints?.durationSeconds,
    );
    const verified = this.validateStoredAsset(storedAsset, asset);
    const sessionTtlMinutes =
      asset.purpose === MediaAssetPurpose.REEL
        ? env.REEL_UPLOAD_SESSION_TTL_MINUTES
        : env.STORY_UPLOAD_SESSION_TTL_MINUTES;
    const nextExpiresAt = new Date(Date.now() + sessionTtlMinutes * 60 * 1_000);
    const updated = await this.repository.markVerified(uploadId, ownerId, {
      providerAssetId: storedAsset.assetId,
      version: storedAsset.version,
      secureUrl: storedAsset.secureUrl,
      thumbnailUrl: this.storage.createThumbnailUrl(asset.publicId, asset.mediaType),
      mimeType: verified.mimeType,
      ...(storedAsset.format ? { format: storedAsset.format.toLowerCase() } : {}),
      fileSizeBytes: storedAsset.bytes,
      width: verified.width,
      height: verified.height,
      ...(verified.durationSeconds !== undefined
        ? { durationSeconds: verified.durationSeconds }
        : {}),
      ...(verified.hasAudio !== undefined ? { hasAudio: verified.hasAudio } : {}),
      expiresAt: nextExpiresAt,
      verifiedAt: new Date(),
    });

    if (updated) {
      return toMediaAssetDto(updated);
    }

    const concurrentResult = await this.repository.findById(uploadId);

    if (concurrentResult?.uploadStatus === MediaAssetUploadStatus.VERIFIED) {
      return toMediaAssetDto(concurrentResult);
    }

    throw new AppError('Upload verification could not be completed.', 409, {
      code: 'UPLOAD_VERIFICATION_FAILED',
    });
  }

  async getStatus(ownerId: string, uploadId: string): Promise<MediaAssetDto> {
    const asset = await this.repository.findById(uploadId);

    if (!asset) {
      throw new NotFoundError('Upload was not found.', { code: 'UPLOAD_NOT_FOUND' });
    }

    if (asset.ownerId.toString() !== ownerId) {
      throw new ForbiddenError('This upload belongs to another user.', {
        code: 'UPLOAD_NOT_OWNED',
      });
    }

    return toMediaAssetDto(asset);
  }

  private validateDeclaredUpload(input: PrepareUploadInput): void {
    const allowedMimeTypes =
      input.purpose === MediaAssetPurpose.REEL
        ? REEL_VIDEO_MIME_TYPES
        : input.mediaType === MediaType.IMAGE
          ? STORY_IMAGE_MIME_TYPES
          : STORY_VIDEO_MIME_TYPES;

    if (!allowedMimeTypes.some((mimeType) => mimeType === input.mimeType)) {
      throw new AppError(
        input.purpose === MediaAssetPurpose.REEL
          ? 'Unsupported Reel media MIME type.'
          : 'Unsupported Story media MIME type.',
        400,
        {
          code: 'UPLOAD_UNSUPPORTED_MIME_TYPE',
          fieldErrors: [
            {
              field: 'mimeType',
              message: `Unsupported MIME type for ${input.mediaType}.`,
              code: 'UPLOAD_UNSUPPORTED_MIME_TYPE',
            },
          ],
        },
      );
    }

    const maximumBytes =
      input.purpose === MediaAssetPurpose.REEL
        ? env.REEL_RAW_VIDEO_MAX_BYTES
        : input.mediaType === MediaType.IMAGE
          ? env.STORY_IMAGE_MAX_BYTES
          : env.STORY_VIDEO_MAX_BYTES;

    if (input.fileSizeBytes > maximumBytes) {
      throw new AppError(
        input.purpose === MediaAssetPurpose.REEL
          ? 'Reel media exceeds the allowed file size.'
          : 'Story media exceeds the allowed file size.',
        413,
        {
          code: 'UPLOAD_FILE_TOO_LARGE',
          fieldErrors: [
            {
              field: 'fileSizeBytes',
              message: `Maximum allowed size is ${maximumBytes} bytes.`,
              code: 'UPLOAD_FILE_TOO_LARGE',
            },
          ],
        },
      );
    }
  }

  private async fetchAuthoritativeAsset(
    publicId: string,
    mediaType: MediaType,
  ): Promise<StoredAsset> {
    try {
      return await this.storage.getAsset(publicId, mediaType);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isCloudinaryNotFoundError(error)) {
        throw new AppError('Uploaded Cloudinary resource was not found.', 422, {
          code: 'UPLOAD_VERIFICATION_FAILED',
        });
      }

      throw new AppError('Cloudinary is temporarily unavailable.', 502, {
        code: 'CLOUDINARY_PROVIDER_UNAVAILABLE',
      });
    }
  }

  private async resolveStoredAssetForVerification(
    publicId: string,
    mediaType: MediaType,
    durationHintSeconds?: number,
  ): Promise<StoredAsset> {
    let latestAsset: StoredAsset | undefined;

    for (let attempt = 0; attempt < UPLOAD_VERIFY_MAX_ATTEMPTS; attempt += 1) {
      latestAsset = await this.fetchAuthoritativeAsset(publicId, mediaType);

      if (mediaType !== MediaType.VIDEO || hasValidVideoDuration(latestAsset.duration)) {
        return latestAsset;
      }

      const delayMs = UPLOAD_VERIFY_RETRY_DELAYS_MS[attempt];

      if (delayMs !== undefined) {
        logger.info(
          {
            publicId,
            attempt: attempt + 1,
            maxAttempts: UPLOAD_VERIFY_MAX_ATTEMPTS,
          },
          'Cloudinary video duration not ready yet; retrying upload verification',
        );
        await sleep(delayMs);
      }
    }

    if (!latestAsset) {
      throw new AppError('Uploaded Cloudinary resource was not found.', 422, {
        code: 'UPLOAD_VERIFICATION_FAILED',
      });
    }

    if (mediaType === MediaType.VIDEO && !hasValidVideoDuration(latestAsset.duration)) {
      return this.enrichStoredAssetWithDurationFallbacks(latestAsset, durationHintSeconds);
    }

    return latestAsset;
  }

  private async enrichStoredAssetWithDurationFallbacks(
    asset: StoredAsset,
    durationHintSeconds?: number,
  ): Promise<StoredAsset> {
    const getInfoDuration = await this.tryCloudinaryGetInfoDuration(asset.publicId);

    if (hasValidVideoDuration(getInfoDuration)) {
      logger.info(
        { publicId: asset.publicId, durationSeconds: getInfoDuration },
        'Resolved missing Cloudinary duration via fl_getinfo',
      );
      return { ...asset, duration: getInfoDuration };
    }

    if (hasValidVideoDuration(durationHintSeconds)) {
      logger.info(
        { publicId: asset.publicId, durationSeconds: durationHintSeconds },
        'Resolved missing Cloudinary duration via client upload hint',
      );
      return { ...asset, duration: durationHintSeconds };
    }

    try {
      const probe = await runFfprobeSource(asset.secureUrl);
      const durationSeconds = probe.durationMs / 1_000;

      logger.info(
        {
          publicId: asset.publicId,
          durationSeconds,
        },
        'Resolved missing Cloudinary duration via ffprobe fallback',
      );

      return {
        ...asset,
        duration: durationSeconds,
        ...(asset.width ? {} : { width: probe.width }),
        ...(asset.height ? {} : { height: probe.height }),
      };
    } catch (error) {
      logger.warn(
        {
          err: error,
          publicId: asset.publicId,
        },
        'All duration fallbacks failed while verifying uploaded video',
      );

      throw new AppError(
        'Uploaded video duration could not be verified. Ensure the file is a valid MP4/MOV video and retry after the Cloudinary upload finishes.',
        422,
        { code: 'UPLOAD_VERIFICATION_FAILED' },
      );
    }
  }

  private async tryCloudinaryGetInfoDuration(publicId: string): Promise<number | undefined> {
    try {
      return await this.storage.getVideoDurationViaGetInfo(publicId);
    } catch (error) {
      logger.warn({ err: error, publicId }, 'Cloudinary fl_getinfo duration lookup failed');
      return undefined;
    }
  }

  private validateStoredAsset(
    asset: StoredAsset,
    pending: {
      mediaType: MediaType;
      mimeType: string;
      purpose: MediaAssetPurpose;
    },
  ): {
    mimeType: string;
    width: number;
    height: number;
    durationSeconds?: number;
    hasAudio?: boolean;
  } {
    if (asset.resourceType !== pending.mediaType) {
      throw new AppError('Uploaded resource type does not match the prepared upload.', 422, {
        code: 'UPLOAD_VERIFICATION_FAILED',
      });
    }

    const mimeType = asset.format
      ? CLOUDINARY_FORMAT_MIME_TYPES[
          asset.format.toLowerCase() as keyof typeof CLOUDINARY_FORMAT_MIME_TYPES
        ]
      : undefined;

    if (!mimeType || mimeType !== pending.mimeType) {
      throw new AppError('Uploaded resource format does not match the prepared upload.', 422, {
        code: 'UPLOAD_VERIFICATION_FAILED',
      });
    }

    const maximumBytes =
      pending.purpose === MediaAssetPurpose.REEL
        ? env.REEL_RAW_VIDEO_MAX_BYTES
        : pending.mediaType === MediaType.IMAGE
          ? env.STORY_IMAGE_MAX_BYTES
          : env.STORY_VIDEO_MAX_BYTES;

    if (!Number.isFinite(asset.bytes) || asset.bytes <= 0 || asset.bytes > maximumBytes) {
      throw new AppError(
        pending.purpose === MediaAssetPurpose.REEL
          ? 'Uploaded Reel media exceeds the allowed file size.'
          : 'Uploaded Story media exceeds the allowed file size.',
        413,
        { code: 'UPLOAD_FILE_TOO_LARGE' },
      );
    }

    const width = asset.width;
    const height = asset.height;

    if (
      !width ||
      !height ||
      width > MAX_MEDIA_DIMENSION ||
      height > MAX_MEDIA_DIMENSION
    ) {
      throw new AppError('Uploaded media has invalid dimensions.', 422, {
        code: 'UPLOAD_VERIFICATION_FAILED',
      });
    }

    if (!isSecureHttpUrl(asset.secureUrl)) {
      throw new AppError('Cloudinary returned an invalid media URL.', 502, {
        code: 'UPLOAD_VERIFICATION_FAILED',
      });
    }

    if (pending.mediaType === MediaType.VIDEO) {
      const durationSeconds = asset.duration;

      if (
        durationSeconds === undefined ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
      ) {
        throw new AppError('Uploaded video duration could not be verified.', 422, {
          code: 'UPLOAD_VERIFICATION_FAILED',
        });
      }

      const maxDurationSeconds =
        pending.purpose === MediaAssetPurpose.REEL
          ? env.REEL_RAW_VIDEO_MAX_DURATION_MS / 1_000
          : env.STORY_VIDEO_MAX_DURATION_SECONDS;

      if (durationSeconds > maxDurationSeconds) {
        throw new AppError(
          pending.purpose === MediaAssetPurpose.REEL
            ? 'Uploaded video exceeds the maximum Reel raw duration.'
            : 'Uploaded video exceeds the maximum Story duration.',
          422,
          {
            code:
              pending.purpose === MediaAssetPurpose.REEL
                ? 'REEL_RAW_DURATION_EXCEEDED'
                : 'STORY_DURATION_EXCEEDED',
          },
        );
      }

      return { mimeType, width, height, durationSeconds };
    }

    return { mimeType, width, height };
  }
}

function hasValidVideoDuration(durationSeconds: number | undefined): boolean {
  return durationSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds > 0;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function isCloudinaryNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'http_code' in error &&
    (error as { http_code?: unknown }).http_code === 404
  );
}

function isSecureHttpUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export const mediaAssetService = new MediaAssetService();
