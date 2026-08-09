import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.config.js';
import { logger } from '../logger/logger.js';
import { cloudinaryStorage, type CloudinaryStorage } from '../storage/index.js';
import { REEL_PROGRESS, REEL_SAFE_ERROR_CODES } from '../../modules/reels/reel.constants.js';
import type { ReelDocument } from '../../modules/reels/reel.model.js';
import {
  reelRepository,
  type ReelRepository,
} from '../../modules/reels/reel.repository.js';
import { buildReelFfmpegGraph, buildThumbnailFfmpegArgs } from './reel-ffmpeg-graph.js';
import { runFfmpeg, runFfprobe } from './ffmpeg.runner.js';

export class ReelProcessorService {
  constructor(
    private readonly reels: ReelRepository = reelRepository,
    private readonly storage: CloudinaryStorage = cloudinaryStorage,
  ) {}

  async process(reelId: string): Promise<void> {
    const claimed = await this.reels.claimForProcessing(reelId);

    if (!claimed) {
      const existing = await this.reels.findById(reelId);

      if (!existing || existing.status === 'ready' || existing.status === 'deleted') {
        return;
      }

      if (existing.status === 'processing') {
        return;
      }

      throw new AppError('Reel is not processable.', 409, {
        code: 'REEL_NOT_PROCESSABLE',
      });
    }

    let workDir: string | undefined;
    let uploadedProcessedPublicId: string | undefined;
    let uploadedThumbnailPublicId: string | undefined;

    try {
      workDir = await this.createWorkDirectory(reelId);
      const rawPath = path.join(workDir, 'raw.mp4');
      const outputPath = path.join(workDir, 'output.mp4');
      const thumbPath = path.join(workDir, 'thumb.jpg');

      await this.setProgress(claimed, REEL_PROGRESS.STARTED);
      await downloadToFile(claimed.rawMedia.secureUrl, rawPath);
      await this.setProgress(claimed, REEL_PROGRESS.RAW_DOWNLOADED);

      const probe = await runFfprobe(rawPath);
      this.assertProbeCompatible(claimed, probe);
      await this.setProgress(claimed, REEL_PROGRESS.INSPECTED);

      let musicPath: string | undefined;
      const audioUrl = claimed.audioEdit.music?.audioSourceUrl || (claimed.audioEdit as any).soundUri;

      if (audioUrl) {
        musicPath = path.join(workDir, 'music.mp3');
        await downloadToFile(audioUrl, musicPath);
        await this.setProgress(claimed, REEL_PROGRESS.MUSIC_PREPARED);
      } else {
        await this.setProgress(claimed, REEL_PROGRESS.MUSIC_PREPARED);
      }

      const refreshed = await this.reels.findById(claimed._id);

      if (!refreshed || refreshed.processing.cancelRequested || refreshed.status === 'deleted') {
        throw new AppError('Reel processing was cancelled.', 409, {
          code: REEL_SAFE_ERROR_CODES.CANCELLED,
        });
      }

      await this.setProgress(claimed, REEL_PROGRESS.FFMPEG_START);
      const graph = buildReelFfmpegGraph({
        reel: claimed,
        rawVideoPath: rawPath,
        musicPath,
        hasOriginalAudio: probe.hasAudio,
        outputVideoPath: outputPath,
      });

      await runFfmpeg({
        args: graph.args,
        timeoutMs: env.REEL_PROCESSING_TIMEOUT_MS,
      });

      await this.setProgress(claimed, REEL_PROGRESS.FFMPEG_DONE);
      await runFfmpeg({
        args: buildThumbnailFfmpegArgs(outputPath, thumbPath),
        timeoutMs: Math.min(env.REEL_PROCESSING_TIMEOUT_MS, 60_000),
      });
      await this.setProgress(claimed, REEL_PROGRESS.THUMBNAIL_DONE);

      const outputProbe = await runFfprobe(outputPath);
      await this.setProgress(claimed, REEL_PROGRESS.UPLOAD_STARTED);

      const processedPublicId = `${env.CLOUDINARY_UPLOAD_FOLDER}/reels/processed/${claimed.ownerId.toString()}/${claimed._id.toString()}`;
      const thumbnailPublicId = `${env.CLOUDINARY_UPLOAD_FOLDER}/reels/thumbnails/${claimed.ownerId.toString()}/${claimed._id.toString()}`;

      const processedUpload = await this.storage.upload(outputPath, {
        publicId: processedPublicId,
        resourceType: 'video',
        overwrite: true,
      });
      uploadedProcessedPublicId = processedUpload.publicId;

      const thumbnailUpload = await this.storage.upload(thumbPath, {
        publicId: thumbnailPublicId,
        resourceType: 'image',
        overwrite: true,
      });
      uploadedThumbnailPublicId = thumbnailUpload.publicId;

      const ready = await this.reels.markReady(
        claimed._id,
        {
          provider: 'cloudinary',
          publicId: processedUpload.publicId,
          version: processedUpload.version,
          secureUrl: processedUpload.secureUrl,
          fileSizeBytes: processedUpload.bytes,
          width: processedUpload.width ?? outputProbe.width,
          height: processedUpload.height ?? outputProbe.height,
          durationMs: outputProbe.durationMs,
          format: processedUpload.format ?? 'mp4',
        },
        {
          provider: 'cloudinary',
          publicId: thumbnailUpload.publicId,
          version: thumbnailUpload.version,
          secureUrl: thumbnailUpload.secureUrl,
          width: thumbnailUpload.width ?? 0,
          height: thumbnailUpload.height ?? 0,
        },
      );

      if (!ready) {
        throw new AppError('Reel was cancelled before completion.', 409, {
          code: REEL_SAFE_ERROR_CODES.CANCELLED,
        });
      }
    } catch (error) {
      await this.cleanupPartialUploads(uploadedProcessedPublicId, uploadedThumbnailPublicId);
      const safe = toSafeProcessingError(error);
      await this.reels.markFailed(claimed._id, safe.code, safe.message);
      throw error;
    } finally {
      if (workDir) {
        await rm(workDir, { recursive: true, force: true }).catch((cleanupError) => {
          logger.warn(
            { err: cleanupError, reelId },
            'Failed to remove Reel temporary directory',
          );
        });
      }
    }
  }

  private async createWorkDirectory(reelId: string): Promise<string> {
    const root = path.resolve(env.MEDIA_TEMP_DIRECTORY);
    await mkdir(root, { recursive: true });
    return mkdtemp(path.join(root, `reel-${reelId}-`));
  }

  private async setProgress(reel: ReelDocument, progress: number): Promise<void> {
    await this.reels.updateProgress(reel._id, progress);
  }

  private assertProbeCompatible(
    reel: ReelDocument,
    probe: { durationMs: number; width: number; height: number },
  ): void {
    const expected = reel.rawMedia.durationMs;
    const delta = Math.abs(probe.durationMs - expected);

    if (delta > 2_000) {
      throw new AppError('Raw video duration mismatch detected.', 422, {
        code: REEL_SAFE_ERROR_CODES.INVALID_MEDIA,
      });
    }

    if (reel.videoEdit.trimEndMs > probe.durationMs + 500) {
      throw new AppError('Video trim exceeds probed duration.', 422, {
        code: REEL_SAFE_ERROR_CODES.INVALID_MEDIA,
      });
    }

    if (!probe.width || !probe.height) {
      throw new AppError('Raw video dimensions are invalid.', 422, {
        code: REEL_SAFE_ERROR_CODES.INVALID_MEDIA,
      });
    }
  }

  private async cleanupPartialUploads(
    processedPublicId?: string,
    thumbnailPublicId?: string,
  ): Promise<void> {
    if (processedPublicId) {
      await this.storage
        .deleteAsset(processedPublicId, { resourceType: 'video', invalidate: true })
        .catch((error) => {
          logger.warn({ err: error, processedPublicId }, 'Failed to delete partial processed video');
        });
    }

    if (thumbnailPublicId) {
      await this.storage
        .deleteAsset(thumbnailPublicId, { resourceType: 'image', invalidate: true })
        .catch((error) => {
          logger.warn({ err: error, thumbnailPublicId }, 'Failed to delete partial thumbnail');
        });
    }
  }
}

async function downloadToFile(url: string, destination: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok || !response.body) {
      throw new AppError('Failed to download media asset.', 502, {
        code: REEL_SAFE_ERROR_CODES.INVALID_MEDIA,
      });
    }

    await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(destination));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('Failed to download media asset.', 502, {
      code: REEL_SAFE_ERROR_CODES.INVALID_MEDIA,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function toSafeProcessingError(error: unknown): { code: string; message: string } {
  const allowed = new Set<string>(Object.values(REEL_SAFE_ERROR_CODES));

  if (error instanceof AppError) {
    return {
      code: allowed.has(error.code) ? error.code : REEL_SAFE_ERROR_CODES.PROCESSING_FAILED,
      message: allowed.has(error.code)
        ? error.message.slice(0, 300)
        : 'Reel processing failed.',
    };
  }

  return {
    code: REEL_SAFE_ERROR_CODES.PROCESSING_FAILED,
    message: 'Reel processing failed.',
  };
}

export const reelProcessorService = new ReelProcessorService();
