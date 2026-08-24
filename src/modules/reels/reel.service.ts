import { createHash } from 'node:crypto';

import type { ClientSession, Types } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';
import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { ConflictError } from '../../common/errors/conflict-error.js';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { env } from '../../config/env.config.js';
import { withDatabaseTransaction } from '../../infrastructure/database/transaction-manager.js';
import { logger } from '../../infrastructure/logger/logger.js';
import {
  cancelProcessReelJob,
  enqueueProcessReelJob,
} from '../../infrastructure/queue/reel.queue.js';
import {
  MediaAssetAttachmentStatus,
  MediaAssetPurpose,
  MediaAssetUploadStatus,
  MediaType,
} from '../media-assets/media-asset.constants.js';
import type { MediaAssetDocument } from '../media-assets/media-asset.model.js';
import {
  mediaAssetRepository,
  type MediaAssetRepository,
} from '../media-assets/media-asset.repository.js';
import { commentRepository } from '../engagement/comment/comment.repository.js';
import { LiveStreamModel, type ILiveStream } from '../live-streams/live-stream.model.js';
import { LIVE_STREAM_STATUS } from '../live-streams/live-stream.constants.js';
import { musicService, type MusicService } from '../music/music.service.js';
import type { MusicTrack } from '../music/music.types.js';
import {
  ReelQueueSubmissionState,
  ReelStatus,
  ReelVisibility,
} from './reel.constants.js';
import { decodeReelCursor, encodeReelCursor } from './reel-cursor.js';
import {
  decodeReelForYouCursor,
  encodeReelForYouCursor,
} from './reel-for-you-cursor.js';
import {
  toReelFeedItemDto,
  toReelStatusDto,
  type ReelFeedItemDto,
  type ReelStatusDto,
} from './reel.mapper.js';
import type {
  CreateReelRecord,
  ReelDocument,
  ReelMusicSnapshot,
} from './reel.model.js';
import { reelRepository, type ReelRepository } from './reel.repository.js';
import {
  reelReportRepository,
  type ReelReportRepository,
} from './reel-report.repository.js';
import type {
  CreateReelInput,
  ReelFeedQuery,
  ReelForYouQuery,
  ReportReelInput,
} from './reel.validation.js';

type TransactionRunner = <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;

export interface CreateReelResult {
  reelId: string;
  status: string;
  progress: number;
  replayed: boolean;
}

export interface ReelFeedResult {
  items: ReelFeedItemDto[];
  nextCursor: string | null;
  pagination: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}

export interface ReelViewResult {
  viewCount: number;
  counted: boolean;
}

export class ReelService {
  constructor(
    private readonly reels: ReelRepository = reelRepository,
    private readonly mediaAssets: MediaAssetRepository = mediaAssetRepository,
    private readonly music: MusicService = musicService,
    private readonly runTransaction: TransactionRunner = withDatabaseTransaction,
    private readonly enqueueJob: typeof enqueueProcessReelJob = enqueueProcessReelJob,
    private readonly cancelJob: typeof cancelProcessReelJob = cancelProcessReelJob,
    private readonly reports: ReelReportRepository = reelReportRepository,
  ) {}

  async create(
    ownerId: string,
    idempotencyKey: string | undefined,
    input: CreateReelInput,
  ): Promise<CreateReelResult> {
    const normalizedKey = validateIdempotencyKey(idempotencyKey);
    const resolvedMediaAssetId = await this.resolveMediaAssetId(ownerId, input);
    const normalizedInput: CreateReelInput = {
      ...input,
      mediaAssetId: resolvedMediaAssetId,
    };
    const requestHash = hashRequest(normalizedInput);
    const existing = await this.reels.findByIdempotencyKey(ownerId, normalizedKey);

    if (existing) {
      this.assertMatchingRequest(existing, requestHash);
      return {
        reelId: existing._id.toString(),
        status: existing.status,
        progress: existing.progress,
        replayed: true,
      };
    }

    const selectedMusic = await this.resolveProcessableMusic(input.audio);

    let transactionResult: { reelId: string; replayed: boolean };

    try {
      transactionResult = await this.runTransaction(async (session) => {
        const existingInTransaction = await this.reels.findByIdempotencyKey(
          ownerId,
          normalizedKey,
          session,
        );

        if (existingInTransaction) {
          this.assertMatchingRequest(existingInTransaction, requestHash);
          return { reelId: existingInTransaction._id.toString(), replayed: true };
        }

        const asset = await this.requirePublishableAsset(resolvedMediaAssetId, ownerId, session);
        const trim = this.resolveVideoTrim(normalizedInput, asset);
        const musicSnapshot = selectedMusic
          ? this.buildMusicSnapshot(normalizedInput, selectedMusic, trim.endMs - trim.startMs)
          : undefined;

        const extractedHashtags = (input.caption?.match(/#[\w]+/g) ?? []).map((h) =>
          h.replace(/^#/, '').toLowerCase(),
        );
        const hashtags = Array.from(new Set([...(input.hashtags ?? []), ...extractedHashtags]));
        const locationSnapshot = input.location
          ? {
              ...(input.location.name ? { name: input.location.name } : {}),
              ...(input.location.latitude !== undefined
                ? { latitude: input.location.latitude }
                : {}),
              ...(input.location.longitude !== undefined
                ? { longitude: input.location.longitude }
                : {}),
            }
          : undefined;

        const rawMediaSnapshot = {
          mediaAssetId: asset._id,
          provider: asset.provider,
          publicId: asset.publicId,
          version: asset.version!,
          secureUrl: asset.secureUrl!,
          width: asset.width!,
          height: asset.height!,
          durationMs: Math.round((asset.durationSeconds || 10) * 1_000),
          fileSizeBytes: asset.fileSizeBytes || 1024,
          mimeType: asset.mimeType,
          ...(asset.format ? { format: asset.format } : {}),
          ...(asset.hasAudio !== undefined ? { hasAudio: asset.hasAudio } : {}),
        };

        const record: CreateReelRecord = {
          ownerId: asset.ownerId,
          status: ReelStatus.QUEUED,
          progress: 0,
          mediaType: input.mediaType || 'video',
          ...(input.caption ? { caption: input.caption } : {}),
          ...(hashtags.length > 0 ? { hashtags } : {}),
          ...(input.mentions && input.mentions.length > 0
            ? { mentions: input.mentions as any }
            : {}),
          ...(locationSnapshot ? { location: locationSnapshot } : {}),
          visibility: input.visibility,
          forKids: input.forKids,
          rawMedia: rawMediaSnapshot,
          audioEdit: {
            originalVolume: input.audio.originalVolume,
            musicVolume: selectedMusic ? input.audio.musicVolume : 0,
            ...(musicSnapshot ? { music: musicSnapshot } : {}),
          },
          videoEdit: {
            trimStartMs: trim.startMs,
            trimEndMs: trim.endMs,
            filter: input.videoEdit.filter,
            effect: input.videoEdit.effect,
            exposure: input.videoEdit.exposure,
            contrast: input.videoEdit.contrast,
            ...(input.videoEdit.overlayText
              ? { overlayText: input.videoEdit.overlayText }
              : {}),
          },
          processing: {
            attempts: 0,
            retryCount: 0,
            queueSubmissionState: ReelQueueSubmissionState.PENDING,
            cancelRequested: false,
          },
          idempotencyKey: normalizedKey,
          requestHash,
        };

        const reel = await this.reels.create(record, session);
        const attached = await this.mediaAssets.attachToReel(
          asset._id,
          ownerId,
          reel._id,
          session,
        );

        if (!attached) {
          throw new ConflictError('Media asset is already attached to another resource.', {
            code: 'MEDIA_ALREADY_ATTACHED',
          });
        }

        return { reelId: reel._id.toString(), replayed: false };
      });
    } catch (error) {
      if (!isMongoDuplicateKeyError(error)) {
        throw error;
      }

      const concurrent = await this.reels.findByIdempotencyKey(ownerId, normalizedKey);

      if (!concurrent) {
        throw new ConflictError('Media asset is already attached to another resource.', {
          code: 'MEDIA_ALREADY_ATTACHED',
        });
      }

      this.assertMatchingRequest(concurrent, requestHash);
      transactionResult = { reelId: concurrent._id.toString(), replayed: true };
    }

    if (!transactionResult.replayed) {
      await this.tryEnqueue(transactionResult.reelId);
    }

    const reel = await this.reels.findById(transactionResult.reelId);

    if (!reel) {
      throw new AppError('Accepted Reel could not be loaded.', 500, {
        code: 'REEL_CREATE_RESULT_UNAVAILABLE',
      });
    }

    return {
      reelId: reel._id.toString(),
      status: reel.status,
      progress: reel.progress,
      replayed: transactionResult.replayed,
    };
  }

  async getById(reelId: string, viewerId?: string): Promise<ReelStatusDto> {
    const reel = await this.reels.findById(reelId);

    if (!reel || reel.status === ReelStatus.DELETED) {
      throw new NotFoundError('Reel was not found.', { code: 'REEL_NOT_FOUND' });
    }

    const isOwner = viewerId !== undefined && reel.ownerId.toString() === viewerId;

    if (!isOwner && (reel.status !== ReelStatus.READY || reel.visibility !== ReelVisibility.PUBLIC)) {
      throw new NotFoundError('Reel was not found.', { code: 'REEL_NOT_FOUND' });
    }

    return toReelStatusDto(reel, viewerId);
  }

  async getFeed(query: ReelFeedQuery, viewerId?: string): Promise<ReelFeedResult> {
    const cursor = query.cursor ? decodeReelCursor(query.cursor) : undefined;
    const records = await this.reels.listReadyPublic(query.limit + 1, cursor, query.hashtag);
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const last = page.at(-1);

    let viewerStateMap: Map<string, { isLiked: boolean; isSaved: boolean }> | undefined;

    if (viewerId && page.length > 0) {
      const { engagementRepository: engRepo } = await import(
        '../engagement/engagement.repository.js'
      );
      const ids = page.map((r) => r._id.toString());
      viewerStateMap = await engRepo.getBulkViewerState(viewerId, 'reel', ids);
    }

    const commentCountMap = await this.getCommentCountMap(page.map((r) => r._id.toString()));

    const nextCursorValue =
      hasNextPage && last?.publishedAt
        ? encodeReelCursor({ publishedAt: last.publishedAt, id: last._id })
        : null;

    const reelItems = page.map((r) => {
        const item = toReelFeedItemDto(r, viewerStateMap?.get(r._id.toString()));
        const actualCommentCount = commentCountMap.get(r._id.toString());
        return actualCommentCount === undefined
          ? item
          : { ...item, stats: { ...item.stats, comments: actualCommentCount } };
      });
    const liveItems = await this.getLiveFeedItems(query.limit);

    return {
      items: this.mixLiveItems(reelItems, liveItems, query.limit),
      nextCursor: nextCursorValue,
      pagination: {
        nextCursor: nextCursorValue,
        hasNextPage,
      },
    };
  }


  async getForYouFeed(
    query: ReelForYouQuery,
    viewerId?: string,
  ): Promise<ReelFeedResult> {
    const cursor = query.cursor ? decodeReelForYouCursor(query.cursor) : undefined;
    const asOf = cursor?.asOf ?? new Date();
    let excludedReelIds: Types.ObjectId[] = [];
    let deprioritizedReelIds: Types.ObjectId[] = [];
    let preferences: { hashtags: string[]; ownerIds: Types.ObjectId[] } = {
      hashtags: [],
      ownerIds: [],
    };

    if (viewerId) {
      const { engagementRepository: engRepo } = await import(
        '../engagement/engagement.repository.js'
      );
      const [viewedIds, reportedIds, likedRecords] = await Promise.all([
        this.reels.listRecentlyViewedReelIds(viewerId),
        this.reports.listReelIdsReportedBy(viewerId),
        engRepo.listLikedByUser(viewerId, 'reel', 100),
      ]);
      excludedReelIds = deduplicateObjectIds(reportedIds);
      deprioritizedReelIds = deduplicateObjectIds(viewedIds);
      preferences = await this.reels.getPreferenceSignals(
        likedRecords.map((record) => record.targetId),
      );
    }

    const records = await this.reels.listForYou(
      query.limit + 1,
      asOf,
      cursor,
      excludedReelIds,
      deprioritizedReelIds,
      preferences,
    );
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const last = page.at(-1);
    const reelIds = page.map(({ reel }) => reel._id.toString());
    let viewerStateMap: Map<string, { isLiked: boolean; isSaved: boolean }> | undefined;

    if (viewerId && reelIds.length > 0) {
      const { engagementRepository: engRepo } = await import(
        '../engagement/engagement.repository.js'
      );
      viewerStateMap = await engRepo.getBulkViewerState(viewerId, 'reel', reelIds);
    }

    const commentCountMap = await this.getCommentCountMap(reelIds);
    const nextCursorValue =
      hasNextPage && last
        ? encodeReelForYouCursor({
            asOf,
            score: last.score,
            publishedAt: last.reel.publishedAt ?? last.reel.createdAt,
            id: last.reel._id,
          })
        : null;

    const reelItems = page.map(({ reel }) => {
        const item = toReelFeedItemDto(reel, viewerStateMap?.get(reel._id.toString()));
        const actualCommentCount = commentCountMap.get(reel._id.toString());
        return actualCommentCount === undefined
          ? item
          : { ...item, stats: { ...item.stats, comments: actualCommentCount } };
      });
    const liveItems = await this.getLiveFeedItems(query.limit);

    return {
      items: this.mixLiveItems(reelItems, liveItems, query.limit),
      nextCursor: nextCursorValue,
      pagination: { nextCursor: nextCursorValue, hasNextPage },
    };
  }

  async getKidsFeed(query: ReelFeedQuery, viewerId: string): Promise<ReelFeedResult> {
    const cursor = query.cursor ? decodeReelCursor(query.cursor) : undefined;
    const reportedIds = await this.reports.listReelIdsReportedBy(viewerId);
    const records = await this.reels.listKidsReadyPublic(
      query.limit + 1,
      cursor,
      query.hashtag,
      deduplicateObjectIds(reportedIds),
    );
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const last = page.at(-1);
    const reelIds = page.map((reel) => reel._id.toString());
    let viewerStateMap: Map<string, { isLiked: boolean; isSaved: boolean }> | undefined;

    if (reelIds.length > 0) {
      const { engagementRepository: engRepo } = await import(
        '../engagement/engagement.repository.js'
      );
      viewerStateMap = await engRepo.getBulkViewerState(viewerId, 'reel', reelIds);
    }

    const commentCountMap = await this.getCommentCountMap(reelIds);
    const nextCursorValue =
      hasNextPage && last
        ? encodeReelCursor({ publishedAt: last.createdAt, id: last._id })
        : null;

    return {
      items: page.map((reel) => {
        const item = toReelFeedItemDto(reel, viewerStateMap?.get(reel._id.toString()));
        const actualCommentCount = commentCountMap.get(reel._id.toString());
        return actualCommentCount === undefined
          ? item
          : { ...item, stats: { ...item.stats, comments: actualCommentCount } };
      }),
      nextCursor: nextCursorValue,
      pagination: { nextCursor: nextCursorValue, hasNextPage },
    };
  }

  async searchReels(query: string, page: number, limit: number, viewerId?: string) {
    const skip = (page - 1) * limit;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // simple escape regex
    const records = await this.reels.search(escapedQuery, limit + 1, skip);
    const hasNextPage = records.length > limit;
    const items = hasNextPage ? records.slice(0, limit) : records;

    let viewerStateMap: Map<string, { isLiked: boolean; isSaved: boolean }> | undefined;

    if (viewerId && items.length > 0) {
      const { engagementRepository: engRepo } = await import(
        '../engagement/engagement.repository.js'
      );
      const reelIds = items.map((r) => r._id.toString());
      viewerStateMap = await engRepo.getBulkViewerState(viewerId, 'reel', reelIds);
    }

    const commentCountMap = await this.getCommentCountMap(items.map((r) => r._id.toString()));

    return {
      reels: items.map((reel) => {
        const item = toReelFeedItemDto(reel, viewerStateMap?.get(reel._id.toString()));
        const actualCommentCount = commentCountMap.get(reel._id.toString());
        return actualCommentCount === undefined
          ? item
          : { ...item, stats: { ...item.stats, comments: actualCommentCount } };
      }),
      hasMore: hasNextPage,
      page,
    };
  }

  async report(
    reelId: string,
    reporterId: string,
    input: ReportReelInput,
  ): Promise<{ reported: boolean }> {
    const reel = await this.reels.findViewableById(reelId);

    if (!reel) {
      throw new NotFoundError('Reel was not found.', { code: 'REEL_NOT_FOUND' });
    }

    if (reel.ownerId.toString() === reporterId) {
      throw new BadRequestError('You cannot report your own Reel.', {
        code: 'REEL_SELF_REPORT_NOT_ALLOWED',
      });
    }

    const reported = await this.runTransaction((session) =>
      this.reports.createIfAbsent(
        reel._id,
        reporterId,
        input.reason,
        input.details,
        session,
      ),
    );
    return { reported };
  }

  async getUserReels(
    userId: string,
    query: ReelFeedQuery,
    viewerId?: string,
  ): Promise<ReelFeedResult> {
    const cursor = query.cursor ? decodeReelCursor(query.cursor) : undefined;
    const records = await this.reels.listPublicByOwner(userId, query.limit + 1, cursor);
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const last = page.at(-1);

    let viewerStateMap: Map<string, { isLiked: boolean; isSaved: boolean }> | undefined;

    if (viewerId && page.length > 0) {
      const { engagementRepository: engRepo } = await import(
        '../engagement/engagement.repository.js'
      );
      const ids = page.map((r) => r._id.toString());
      viewerStateMap = await engRepo.getBulkViewerState(viewerId, 'reel', ids);
    }

    const commentCountMap = await this.getCommentCountMap(page.map((r) => r._id.toString()));

    const nextCursorValue =
      hasNextPage && last?.publishedAt
        ? encodeReelCursor({ publishedAt: last.publishedAt, id: last._id })
        : null;

    return {
      items: page.map((r) => {
        const item = toReelFeedItemDto(r, viewerStateMap?.get(r._id.toString()));
        const actualCommentCount = commentCountMap.get(r._id.toString());
        return actualCommentCount === undefined
          ? item
          : { ...item, stats: { ...item.stats, comments: actualCommentCount } };
      }),
      nextCursor: nextCursorValue,
      pagination: {
        nextCursor: nextCursorValue,
        hasNextPage,
      },
    };
  }

  async getViews(reelId: string): Promise<{ viewCount: number }> {
    const reel = await this.reels.findViewableById(reelId);

    if (!reel) {
      throw new NotFoundError('Reel was not found or is not available.', {
        code: 'REEL_NOT_FOUND',
      });
    }

    return { viewCount: reel.viewCount || 0 };
  }

  async recordView(reelId: string, viewerId: string): Promise<ReelViewResult> {
    const reel = await this.reels.findViewableById(reelId);

    if (!reel) {
      throw new NotFoundError('Reel was not found or is not available.', {
        code: 'REEL_NOT_FOUND',
      });
    }

    if (reel.ownerId.toString() === viewerId) {
      return { viewCount: reel.viewCount || 0, counted: false };
    }

    const inserted = await this.reels.createViewIfAbsent(reel._id, viewerId);

    if (!inserted) {
      return { viewCount: reel.viewCount || 0, counted: false };
    }

    const viewCount = await this.reels.incrementViewCount(reel._id);
    return { viewCount, counted: true };
  }

  async retry(reelId: string, ownerId: string): Promise<CreateReelResult> {
    const existing = await this.reels.findByIdForOwner(reelId, ownerId);

    if (!existing || existing.status === ReelStatus.DELETED) {
      throw new NotFoundError('Reel was not found.', { code: 'REEL_NOT_FOUND' });
    }

    if (
      existing.status !== ReelStatus.FAILED &&
      existing.processing.queueSubmissionState !== ReelQueueSubmissionState.FAILED
    ) {
      throw new ConflictError('Only failed Reels can be retried.', {
        code: 'REEL_RETRY_NOT_ALLOWED',
      });
    }

    if (existing.processing.retryCount >= env.REEL_MAX_RETRY_COUNT) {
      throw new AppError('Reel retry limit exceeded.', 429, {
        code: 'REEL_RETRY_LIMIT_EXCEEDED',
      });
    }

    const asset = await this.mediaAssets.findById(existing.rawMedia.mediaAssetId);

    if (!asset || asset.uploadStatus !== MediaAssetUploadStatus.VERIFIED) {
      throw new ConflictError('Raw media asset is no longer available for retry.', {
        code: 'REEL_RAW_MEDIA_UNAVAILABLE',
      });
    }

    const prepared = await this.reels.prepareRetry(reelId, ownerId);

    if (!prepared) {
      throw new ConflictError('Reel could not be prepared for retry.', {
        code: 'REEL_RETRY_NOT_ALLOWED',
      });
    }

    await this.tryEnqueue(prepared._id.toString());
    const reel = await this.reels.findById(prepared._id);

    return {
      reelId: prepared._id.toString(),
      status: reel?.status ?? ReelStatus.QUEUED,
      progress: reel?.progress ?? 0,
      replayed: false,
    };
  }

  async delete(reelId: string, ownerId: string): Promise<void> {
    await this.runTransaction(async (session) => {
      const reel = await this.reels.findById(reelId, session);

      if (!reel) {
        throw new NotFoundError('Reel was not found.', { code: 'REEL_NOT_FOUND' });
      }

      if (reel.ownerId.toString() !== ownerId) {
        throw new ForbiddenError('Only the Reel owner can delete this Reel.', {
          code: 'REEL_NOT_OWNED',
        });
      }

      if (reel.status === ReelStatus.DELETED) {
        return;
      }

      const deletedAt = new Date();
      await this.reels.markDeleted(reel._id, deletedAt, session);
      await this.mediaAssets.makeCleanupEligible(
        reel.rawMedia.mediaAssetId,
        deletedAt,
        session,
      );
    });

    await this.cancelJob(reelId).catch((error) => {
      logger.warn({ err: error, reelId }, 'Failed to cancel Reel queue job after delete');
    });
  }

  async reconcileMissingJobs(limit = 100): Promise<{ enqueued: number; failed: number }> {
    const candidates = await this.reels.findQueueRecoveryCandidates(limit);
    let enqueued = 0;
    let failed = 0;

    for (const reel of candidates) {
      try {
        await this.tryEnqueue(reel._id.toString());
        enqueued += 1;
      } catch {
        failed += 1;
      }
    }

    return { enqueued, failed };
  }

  async failStaleProcessing(limit = 100): Promise<number> {
    const before = new Date(Date.now() - env.REEL_STALE_PROCESSING_MS);
    const stale = await this.reels.findStaleProcessing(before, limit);

    for (const reel of stale) {
      await this.reels.markFailed(
        reel._id,
        'REEL_PROCESSING_TIMEOUT',
        'Processing exceeded the allowed time and was marked failed.',
      );
    }

    return stale.length;
  }

  private async tryEnqueue(reelId: string): Promise<void> {
    try {
      const jobId = await this.enqueueJob(reelId);
      await this.reels.markQueueSubmitted(
        (await this.reels.findById(reelId))!._id,
        jobId,
      );
    } catch (error) {
      logger.error({ err: error, reelId }, 'Failed to enqueue Reel processing job');
      const reel = await this.reels.findById(reelId);

      if (reel) {
        await this.reels.markQueueSubmissionFailed(reel._id);
      }
    }
  }

  private async resolveMediaAssetId(
    ownerId: string,
    input: CreateReelInput,
  ): Promise<string> {
    if (input.mediaAssetId) {
      return input.mediaAssetId;
    }

    const asset = await this.mediaAssets.findByPublicId(input.rawMediaKey!);

    if (!asset) {
      throw new NotFoundError('Raw media key was not found.', { code: 'UPLOAD_NOT_FOUND' });
    }

    if (asset.ownerId.toString() !== ownerId) {
      throw new ForbiddenError('Media asset belongs to another user.', {
        code: 'UPLOAD_NOT_OWNED',
      });
    }

    return asset._id.toString();
  }

  private assertMatchingRequest(existing: ReelDocument, requestHash: string): void {
    if (existing.requestHash !== requestHash) {
      throw new ConflictError('Idempotency-Key was already used for a different request.', {
        code: 'REEL_IDEMPOTENCY_CONFLICT',
      });
    }
  }

  private async getCommentCountMap(reelIds: string[]): Promise<Map<string, number>> {
    if (reelIds.length === 0) {
      return new Map();
    }

    try {
      return await commentRepository.countForTargets('reel', reelIds);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load Reel comment counts; falling back to stored counters');
      return new Map();
    }
  }

  private async getLiveFeedItems(limit: number): Promise<ReelFeedItemDto[]> {
    const streams = await LiveStreamModel.find({
      $or: [
        { status: LIVE_STREAM_STATUS.LIVE },
        {
          status: LIVE_STREAM_STATUS.ENDED,
          'recording.status': 'stopped',
          'recording.fileList': { $exists: true },
        },
      ],
    })
      .sort({ status: 1, startedAt: -1, endedAt: -1 })
      .limit(Math.min(5, Math.max(1, limit)))
      .populate('hostId', 'profile email isVerified subscriptionStatus subscriptionExpiresAt')
      .exec();

    return streams
      .map((stream) => this.mapLiveStreamToFeedItem(stream))
      .filter((item): item is ReelFeedItemDto => Boolean(item));
  }

  private mixLiveItems(reels: ReelFeedItemDto[], liveItems: ReelFeedItemDto[], limit: number): ReelFeedItemDto[] {
    if (liveItems.length === 0) return reels;

    const seen = new Set<string>();
    const mixed: ReelFeedItemDto[] = [];

    for (const item of [...liveItems, ...reels]) {
      const key = `${item.kind ?? 'reel'}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mixed.push(item);
      if (mixed.length >= limit) break;
    }

    return mixed;
  }

  private mapLiveStreamToFeedItem(stream: ILiveStream): ReelFeedItemDto | null {
    const host = stream.hostId as any;
    const isLive = stream.status === LIVE_STREAM_STATUS.LIVE;
    const replayUrl = isLive ? null : this.resolveRecordingPlaybackUrl(stream.recording?.fileList);

    if (!isLive && !replayUrl) {
      return null;
    }

    const hostId = host?._id?.toString() || host?.toString() || '';
    const profile = host?.profile;
    const createdAt = stream.startedAt ?? stream.createdAt ?? new Date();
    const publishedAt = isLive ? createdAt : stream.endedAt ?? createdAt;
    const coverImage = stream.coverImage || profile?.photoUrl || '';
    const isPremium = Boolean(
      host?.subscriptionStatus === 'active' &&
        host.subscriptionExpiresAt &&
        host.subscriptionExpiresAt.getTime() > Date.now(),
    );

    return {
      kind: isLive ? 'live' : 'live_replay',
      id: `${isLive ? 'live' : 'live-replay'}-${stream._id.toString()}`,
      liveStreamId: stream._id.toString(),
      liveStatus: stream.status,
      videoUrl: replayUrl || coverImage,
      thumbnailUrl: coverImage || replayUrl || '',
      durationMs: Math.max(1000, stream.endedAt && stream.startedAt ? stream.endedAt.getTime() - stream.startedAt.getTime() : 0),
      caption: stream.description || stream.title || null,
      hashtags: [],
      mentions: [],
      location: null,
      mediaType: isLive ? 'photo' : 'video',
      upload: {
        mediaAssetId: stream._id.toString(),
        provider: 'cloudinary',
        publicId: stream.channelName,
        version: 1,
        secureUrl: replayUrl || coverImage,
        width: 720,
        height: 1280,
        durationMs: 0,
        fileSizeBytes: 0,
        mimeType: isLive ? 'image/jpeg' : 'video/mp4',
        format: isLive ? 'jpg' : 'mp4',
        hasAudio: true,
      },
      edit: {
        filter: 'none',
        effect: 'none',
        overlayText: null,
      },
      kids: false,
      forKids: false,
      user: {
        id: hostId,
        email: host?.email ?? null,
        username: profile?.username ?? host?.email?.split('@')[0] ?? null,
        displayName: profile?.displayName ?? profile?.username ?? host?.email?.split('@')[0] ?? null,
        avatarUrl: profile?.photoUrl ?? null,
        isPremium,
      },
      stats: {
        likes: stream.likesCount || 0,
        comments: stream.commentsCount || 0,
        shares: stream.sharesCount || 0,
        views: stream.peakViewerCount || stream.viewerCount || 0,
      },
      viewerState: null,
      createdAt: createdAt.toISOString(),
      publishedAt: publishedAt.toISOString(),
    };
  }

  private resolveRecordingPlaybackUrl(fileList: unknown): string | null {
    const baseUrl = env.AGORA_RECORDING_PUBLIC_BASE_URL?.replace(/\/+$/, '');
    if (!baseUrl) return null;

    const files = Array.isArray(fileList) ? fileList : [];
    const preferred = files.find((file) => {
      const fileName = typeof file === 'string' ? file : (file as any)?.fileName;
      return typeof fileName === 'string' && /\.(mp4|m3u8)$/i.test(fileName);
    });
    const fileName = typeof preferred === 'string' ? preferred : (preferred as any)?.fileName;
    if (typeof fileName !== 'string') return null;

    return `${baseUrl}/${fileName.replace(/^\/+/, '')}`;
  }

  private async requirePublishableAsset(
    mediaAssetId: string,
    ownerId: string,
    session: ClientSession,
  ): Promise<MediaAssetDocument> {
    const asset = await this.mediaAssets.findById(mediaAssetId, session);

    if (!asset) {
      throw new NotFoundError('Media asset was not found.', { code: 'UPLOAD_NOT_FOUND' });
    }

    if (asset.ownerId.toString() !== ownerId) {
      throw new ForbiddenError('Media asset belongs to another user.', {
        code: 'UPLOAD_NOT_OWNED',
      });
    }

    if (asset.purpose !== MediaAssetPurpose.REEL) {
      throw new AppError('Media asset was not prepared for Reel publishing.', 422, {
        code: 'UPLOAD_INVALID_PURPOSE',
      });
    }

    if (asset.uploadStatus !== MediaAssetUploadStatus.VERIFIED) {
      throw new ConflictError('Media asset has not been verified.', {
        code: 'UPLOAD_NOT_VERIFIED',
      });
    }

    if (
      asset.attachmentStatus !== MediaAssetAttachmentStatus.UNATTACHED ||
      asset.attachedStoryId ||
      asset.attachedReelId
    ) {
      throw new ConflictError('Media asset is already attached to another resource.', {
        code: 'MEDIA_ALREADY_ATTACHED',
      });
    }

    if (asset.expiresAt.getTime() <= Date.now()) {
      throw new AppError('Media asset upload session has expired.', 410, {
        code: 'UPLOAD_SESSION_EXPIRED',
      });
    }

    if (asset.mediaType !== MediaType.VIDEO && asset.mediaType !== MediaType.IMAGE) {
      throw new AppError('Reel media must be a verified video or image asset.', 422, {
        code: 'UPLOAD_INVALID_MEDIA_TYPE',
      });
    }

    if (
      !asset.secureUrl ||
      !asset.version ||
      !asset.fileSizeBytes ||
      !asset.width ||
      !asset.height ||
      (asset.mediaType === MediaType.VIDEO && asset.durationSeconds === undefined)
    ) {
      throw new ConflictError('Media asset verification metadata is incomplete.', {
        code: 'UPLOAD_NOT_VERIFIED',
      });
    }

    return asset;
  }

  private resolveVideoTrim(
    input: CreateReelInput,
    asset: MediaAssetDocument,
  ): { startMs: number; endMs: number } {
    const rawDurationMs = Math.round((asset.durationSeconds ?? 10) * 1_000);
    const startMs = input.videoEdit.trim?.startMs ?? 0;
    let endMs = input.videoEdit.trim?.endMs ?? rawDurationMs;

    if (startMs < 0 || endMs <= startMs) {
      throw new AppError('Video trim range is invalid.', 422, {
        code: 'REEL_INVALID_VIDEO_TRIM',
      });
    }

    // Allow a small tolerance (e.g. up to 1.5 seconds) for duration discrepancies 
    // between frontend metadata and ffprobe verification.
    if (endMs > rawDurationMs && endMs - rawDurationMs < 1500) {
      endMs = rawDurationMs;
    }

    if (endMs > rawDurationMs) {
      throw new AppError('Video trim exceeds the verified raw duration.', 422, {
        code: 'REEL_INVALID_VIDEO_TRIM',
      });
    }

    const durationMs = endMs - startMs;

    if (durationMs < env.REEL_MIN_DURATION_MS) {
      throw new AppError('Trimmed Reel is shorter than the minimum duration.', 422, {
        code: 'REEL_DURATION_TOO_SHORT',
      });
    }

    if (durationMs > env.REEL_MAX_DURATION_MS) {
      throw new AppError('Trimmed Reel exceeds the maximum duration.', 422, {
        code: 'REEL_DURATION_TOO_LONG',
      });
    }

    return { startMs, endMs };
  }

  private buildMusicSnapshot(
    input: CreateReelInput,
    track: MusicTrack,
    reelDurationMs: number,
  ): ReelMusicSnapshot {
    const trim = input.audio.musicTrim!;
    const trackDurationMs = track.durationSeconds * 1_000;

    if (trim.endMs > trackDurationMs) {
      throw new AppError('Music trim exceeds the verified track duration.', 422, {
        code: 'MUSIC_DURATION_EXCEEDED',
      });
    }

    const musicSegmentMs = trim.endMs - trim.startMs;

    if (musicSegmentMs < reelDurationMs) {
      throw new AppError('Music segment must cover the complete Reel duration.', 422, {
        code: 'MUSIC_INVALID_CLIP_DURATION',
      });
    }

    if (!track.downloadAllowed || !track.downloadUrl) {
      throw new AppError(
        'Selected music cannot be downloaded for FFmpeg processing.',
        422,
        { code: 'MUSIC_PROCESSING_NOT_ALLOWED' },
      );
    }

    return {
      provider: 'jamendo',
      providerTrackId: track.providerTrackId,
      title: track.title,
      artistName: track.artistName,
      ...(track.albumName ? { albumName: track.albumName } : {}),
      ...(track.coverImageUrl ? { coverImageUrl: track.coverImageUrl } : {}),
      audioSourceUrl: track.downloadUrl,
      trackDurationMs,
      ...(track.licenseUrl ? { licenseUrl: track.licenseUrl } : {}),
      downloadAllowed: true,
      trimStartMs: trim.startMs,
      trimEndMs: trim.startMs + reelDurationMs,
      volume: input.audio.musicVolume,
      verifiedAt: new Date(),
    };
  }

  private async resolveProcessableMusic(input: CreateReelInput['audio']): Promise<MusicTrack | undefined> {
    if (!input.musicId && !input.soundUri) {
      return undefined;
    }

    if (input.musicId) {
      const track = await this.music.getTrackById(input.musicId);

      if (track?.downloadAllowed && track.downloadUrl) {
        return track;
      }

      if (!input.soundUri) {
        if (!track) {
          throw new NotFoundError('Jamendo music track was not found.', {
            code: 'MUSIC_TRACK_NOT_FOUND',
          });
        }

        throw new AppError(
          'Selected music cannot be downloaded for FFmpeg processing.',
          422,
          { code: 'MUSIC_PROCESSING_NOT_ALLOWED' },
        );
      }

      logger.warn(
        { musicId: input.musicId },
        'Jamendo track lookup failed; falling back to submitted sound URL',
      );
    }

    if (!input.soundUri) {
      return undefined;
    }

    return {
      provider: 'jamendo',
      providerTrackId: input.musicId || `url-${createHash('sha1').update(input.soundUri).digest('hex').slice(0, 16)}`,
      title: input.musicTitle || 'Added music',
      artistName: input.musicArtist || 'Original audio',
      albumName: null,
      coverImageUrl: null,
      audioPreviewUrl: input.soundUri,
      durationSeconds: 24 * 60 * 60,
      shareUrl: null,
      licenseUrl: null,
      downloadAllowed: true,
      downloadUrl: input.soundUri,
    };
  }
}

function validateIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();

  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new AppError('A valid Idempotency-Key header is required.', 400, {
      code: 'REEL_IDEMPOTENCY_KEY_REQUIRED',
      fieldErrors: [
        {
          field: 'Idempotency-Key',
          message: 'Use 8-128 letters, numbers, dots, underscores, colons, or hyphens.',
          code: 'REEL_IDEMPOTENCY_KEY_REQUIRED',
        },
      ],
    });
  }

  return key;
}

function hashRequest(input: CreateReelInput): string {
  const stable = {
    mediaAssetId: input.mediaAssetId,
    caption: input.caption,
    visibility: input.visibility,
    forKids: input.forKids,
    audio: input.audio,
    videoEdit: input.videoEdit,
  };
  return createHash('sha256').update(stableStringify(stable)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11_000
  );
}

function deduplicateObjectIds(ids: Types.ObjectId[]): Types.ObjectId[] {
  return [...new Map(ids.map((id) => [id.toString(), id])).values()];
}

export const reelService = new ReelService();
