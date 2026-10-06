import { createHash } from 'node:crypto';

import type { ClientSession } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';
import { ConflictError } from '../../common/errors/conflict-error.js';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { env } from '../../config/env.config.js';
import { withDatabaseTransaction } from '../../infrastructure/database/transaction-manager.js';
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
import { musicService, type MusicService } from '../music/music.service.js';
import type { MusicTrack } from '../music/music.types.js';
import {
  StoryProcessingStatus,
  StoryStatus,
  StoryVisibility,
} from './story.constants.js';
import { decodeStoryCursor, encodeStoryCursor } from './story-cursor.js';
import { toStoryDto, type StoryDto } from './story.mapper.js';
import type {
  CreateStoryRecord,
  StoryDocument,
  StoryMediaSnapshot,
  StoryMusicSnapshot,
} from './story.model.js';
import { storyRepository, type StoryRepository } from './story.repository.js';
import type {
  CreateStoryInput,
  StoryFeedQuery,
  StoryMusicInput,
} from './story.validation.js';

type TransactionRunner = <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;

export interface CreateStoryResult {
  story: StoryDto;
  replayed: boolean;
}

export interface StoryFeedResult {
  stories: StoryDto[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}

export class StoryService {
  constructor(
    private readonly stories: StoryRepository = storyRepository,
    private readonly mediaAssets: MediaAssetRepository = mediaAssetRepository,
    private readonly music: MusicService = musicService,
    private readonly runTransaction: TransactionRunner = withDatabaseTransaction,
  ) {}

  async create(
    ownerId: string,
    idempotencyKey: string | undefined,
    input: CreateStoryInput,
  ): Promise<CreateStoryResult> {
    const normalizedKey = validateIdempotencyKey(idempotencyKey);
    const requestHash = hashRequest(input);
    const existing = await this.stories.findByIdempotencyKey(ownerId, normalizedKey);

    if (existing) {
      return this.resolveExistingIdempotency(existing, requestHash);
    }

    const verifiedTrack = input.music
      ? await this.verifyMusicTrack(input.music.providerTrackId)
      : undefined;

    let transactionResult: { storyId: string; replayed: boolean };

    try {
      transactionResult = await this.runTransaction(async (session) => {
        const existingInTransaction = await this.stories.findByIdempotencyKey(
          ownerId,
          normalizedKey,
          session,
        );

        if (existingInTransaction) {
          this.assertMatchingRequest(existingInTransaction, requestHash);
          return { storyId: existingInTransaction._id.toString(), replayed: true };
        }

        const asset = await this.requirePublishableAsset(
          input.mediaAssetId,
          ownerId,
          input.mediaType,
          session,
        );
        const playbackDurationSeconds = this.calculatePlaybackDuration(input, asset);
        const musicSnapshot = input.music
          ? this.buildMusicSnapshot(input.music, verifiedTrack!, playbackDurationSeconds)
          : undefined;
        const publishedAt = new Date();
        const expiresAt = new Date(
          publishedAt.getTime() + env.STORY_DURATION_HOURS * 60 * 60 * 1_000,
        );
        const storyRecord: CreateStoryRecord = {
          ownerId: asset.ownerId,
          media: this.buildMediaSnapshot(asset),
          ...(input.mediaType === MediaType.IMAGE
            ? { imageSettings: { displayDurationSeconds: input.displayDurationSeconds } }
            : { videoEditing: input.videoEditing }),
          ...(musicSnapshot ? { music: musicSnapshot } : {}),
          ...(input.caption ? { caption: input.caption } : {}),
          visibility: StoryVisibility.PUBLIC,
          status: StoryStatus.ACTIVE,
          processingStatus: StoryProcessingStatus.NOT_REQUIRED,
          playbackDurationSeconds,
          idempotencyKey: normalizedKey,
          requestHash,
          publishedAt,
          expiresAt,
        };
        const story = await this.stories.create(storyRecord, session);
        const attached = await this.mediaAssets.attachToStory(
          asset._id,
          ownerId,
          story._id,
          expiresAt,
          session,
        );

        if (!attached) {
          throw new ConflictError('Media asset is already attached to another Story.', {
            code: 'MEDIA_ALREADY_ATTACHED',
          });
        }

        return { storyId: story._id.toString(), replayed: false };
      });
    } catch (error) {
      if (!isMongoDuplicateKeyError(error)) {
        throw error;
      }

      const concurrentStory = await this.stories.findByIdempotencyKey(ownerId, normalizedKey);

      if (!concurrentStory) {
        throw new ConflictError('Media asset is already attached to another Story.', {
          code: 'MEDIA_ALREADY_ATTACHED',
        });
      }

      this.assertMatchingRequest(concurrentStory, requestHash);
      transactionResult = { storyId: concurrentStory._id.toString(), replayed: true };
    }

    const story = await this.stories.findActivePublicById(transactionResult.storyId, new Date());

    if (!story) {
      throw new AppError('Published Story could not be loaded.', 500, {
        code: 'STORY_PUBLISH_RESULT_UNAVAILABLE',
      });
    }

    return { story: toStoryDto(story), replayed: transactionResult.replayed };
  }

  async getFeed(query: StoryFeedQuery): Promise<StoryFeedResult> {
    const cursor = query.cursor ? decodeStoryCursor(query.cursor) : undefined;
    const records = await this.stories.listActivePublic(
      new Date(),
      query.limit + 1,
      cursor,
    );
    const hasNextPage = records.length > query.limit;
    const page = hasNextPage ? records.slice(0, query.limit) : records;
    const last = page.at(-1);

    return {
      stories: page.map(toStoryDto),
      pagination: {
        limit: query.limit,
        nextCursor:
          hasNextPage && last
            ? encodeStoryCursor({ publishedAt: last.publishedAt, id: last._id })
            : null,
        hasNextPage,
      },
    };
  }

  async getById(storyId: string): Promise<StoryDto> {
    const story = await this.stories.findActivePublicById(storyId, new Date());

    if (!story) {
      throw new NotFoundError('Story was not found.', { code: 'STORY_NOT_FOUND' });
    }

    return toStoryDto(story);
  }

  async recordView(storyId: string, viewerId: string): Promise<{ viewCount: number; counted: boolean }> {
    try {
      return await this.runTransaction(async (session) => {
        const story = await this.stories.findActiveDocumentById(storyId, new Date(), session);

        if (!story) {
          throw new NotFoundError('Story was not found.', { code: 'STORY_NOT_FOUND' });
        }

        if (story.ownerId.toString() === viewerId) {
          return { viewCount: story.viewCount, counted: false };
        }

        const inserted = await this.stories.createViewIfAbsent(
          story._id,
          viewerId,
          story.expiresAt,
          session,
        );

        if (!inserted) {
          return { viewCount: story.viewCount, counted: false };
        }

        const viewCount = await this.stories.incrementViewCount(story._id, session);
        return { viewCount, counted: true };
      });
    } catch (error) {
      if (!isMongoDuplicateKeyError(error)) {
        throw error;
      }

      const story = await this.stories.findActiveDocumentById(storyId, new Date());

      if (!story) {
        throw new NotFoundError('Story was not found.', { code: 'STORY_NOT_FOUND' });
      }

      return { viewCount: story.viewCount, counted: false };
    }
  }

  async delete(storyId: string, ownerId: string): Promise<void> {
    await this.runTransaction(async (session) => {
      const story = await this.stories.findByIdForMutation(storyId, session);

      if (!story) {
        throw new NotFoundError('Story was not found.', { code: 'STORY_NOT_FOUND' });
      }

      if (story.ownerId.toString() !== ownerId) {
        throw new ForbiddenError('Only the Story owner can delete this Story.', {
          code: 'STORY_NOT_OWNED',
        });
      }

      if (story.status === StoryStatus.DELETED) {
        throw new ConflictError('Story has already been deleted.', {
          code: 'STORY_ALREADY_DELETED',
        });
      }

      if (story.expiresAt.getTime() <= Date.now()) {
        throw new AppError('Story has expired.', 410, { code: 'STORY_EXPIRED' });
      }

      const deletedAt = new Date();
      await this.stories.markDeleted(story._id, deletedAt, session);
      await this.mediaAssets.makeCleanupEligible(
        story.media.mediaAssetId,
        deletedAt,
        session,
      );
    });
  }

  private async resolveExistingIdempotency(
    existing: StoryDocument,
    requestHash: string,
  ): Promise<CreateStoryResult> {
    this.assertMatchingRequest(existing, requestHash);
    const story = await this.stories.findActivePublicById(existing._id.toString(), new Date());

    if (!story) {
      throw new ConflictError('The idempotent Story is no longer active.', {
        code: 'STORY_ALREADY_DELETED',
      });
    }

    return { story: toStoryDto(story), replayed: true };
  }

  private assertMatchingRequest(existing: StoryDocument, requestHash: string): void {
    if (existing.requestHash !== requestHash) {
      throw new ConflictError('Idempotency-Key was already used for a different request.', {
        code: 'STORY_IDEMPOTENCY_CONFLICT',
      });
    }
  }

  private async requirePublishableAsset(
    mediaAssetId: string,
    ownerId: string,
    mediaType: MediaType,
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

    if (asset.purpose && asset.purpose !== MediaAssetPurpose.STORY) {
      throw new AppError('Media asset was not prepared for Story publishing.', 422, {
        code: 'UPLOAD_INVALID_PURPOSE',
      });
    }

    if (asset.expiresAt.getTime() <= Date.now()) {
      throw new AppError('Media asset upload session has expired.', 410, {
        code: 'UPLOAD_SESSION_EXPIRED',
      });
    }

    if (asset.mediaType !== mediaType) {
      throw new AppError('Story mediaType does not match the verified media asset.', 422, {
        code: 'UPLOAD_INVALID_MEDIA_TYPE',
      });
    }

    if (
      !asset.secureUrl ||
      !asset.thumbnailUrl ||
      !asset.version ||
      !asset.fileSizeBytes ||
      !asset.width ||
      !asset.height
    ) {
      throw new ConflictError('Media asset verification metadata is incomplete.', {
        code: 'UPLOAD_NOT_VERIFIED',
      });
    }

    return asset;
  }

  private calculatePlaybackDuration(
    input: CreateStoryInput,
    asset: MediaAssetDocument,
  ): number {
    if (input.mediaType === MediaType.IMAGE) {
      return input.displayDurationSeconds;
    }

    const originalDuration = asset.durationSeconds;

    if (!originalDuration) {
      throw new ConflictError('Verified video duration is unavailable.', {
        code: 'UPLOAD_NOT_VERIFIED',
      });
    }

    if (
      input.videoEditing.trimEndSeconds <= input.videoEditing.trimStartSeconds ||
      input.videoEditing.trimEndSeconds > originalDuration
    ) {
      throw new AppError('Video trim range is invalid.', 422, {
        code: 'STORY_INVALID_VIDEO_TRIM',
      });
    }

    const duration = input.videoEditing.trimEndSeconds - input.videoEditing.trimStartSeconds;

    if (duration > env.STORY_VIDEO_MAX_DURATION_SECONDS) {
      throw new AppError('Trimmed video exceeds the maximum Story duration.', 422, {
        code: 'STORY_DURATION_EXCEEDED',
      });
    }

    return duration;
  }

  private buildMediaSnapshot(asset: MediaAssetDocument): StoryMediaSnapshot {
    return {
      mediaAssetId: asset._id,
      provider: asset.provider,
      publicId: asset.publicId,
      version: asset.version!,
      resourceType: asset.resourceType,
      mediaType: asset.mediaType,
      secureUrl: asset.secureUrl!,
      thumbnailUrl: asset.thumbnailUrl!,
      mimeType: asset.mimeType,
      width: asset.width!,
      height: asset.height!,
      fileSizeBytes: asset.fileSizeBytes!,
      ...(asset.durationSeconds !== undefined
        ? { originalDurationSeconds: asset.durationSeconds }
        : {}),
    };
  }

  private buildMusicSnapshot(
    input: StoryMusicInput,
    track: MusicTrack,
    playbackDurationSeconds: number,
  ): StoryMusicSnapshot {
    if (input.startTimeSeconds + input.clipDurationSeconds > track.durationSeconds) {
      throw new AppError('Music selection exceeds the verified track duration.', 422, {
        code: 'MUSIC_DURATION_EXCEEDED',
      });
    }

    if (input.clipDurationSeconds < playbackDurationSeconds) {
      throw new AppError('Music clip must cover the complete Story playback duration.', 422, {
        code: 'MUSIC_INVALID_CLIP_DURATION',
      });
    }

    return {
      provider: 'jamendo',
      providerTrackId: track.providerTrackId,
      title: track.title,
      artistName: track.artistName,
      ...(track.albumName ? { albumName: track.albumName } : {}),
      ...(track.coverImageUrl ? { coverImageUrl: track.coverImageUrl } : {}),
      audioPreviewUrl: track.audioPreviewUrl,
      trackDurationSeconds: track.durationSeconds,
      ...(track.shareUrl ? { shareUrl: track.shareUrl } : {}),
      ...(track.licenseUrl ? { licenseUrl: track.licenseUrl } : {}),
      downloadAllowed: track.downloadAllowed,
      startTimeSeconds: input.startTimeSeconds,
      clipDurationSeconds: input.clipDurationSeconds,
      volume: input.volume,
      verifiedAt: new Date(),
    };
  }

  private async verifyMusicTrack(providerTrackId: string): Promise<MusicTrack> {
    const track = await this.music.getTrackById(providerTrackId);

    if (!track) {
      throw new NotFoundError('Jamendo music track was not found.', {
        code: 'MUSIC_TRACK_NOT_FOUND',
      });
    }

    return track;
  }
}

function validateIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();

  if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new AppError('A valid Idempotency-Key header is required.', 400, {
      code: 'STORY_IDEMPOTENCY_KEY_REQUIRED',
      fieldErrors: [
        {
          field: 'Idempotency-Key',
          message: 'Use 8-128 letters, numbers, dots, underscores, colons, or hyphens.',
          code: 'STORY_IDEMPOTENCY_KEY_REQUIRED',
        },
      ],
    });
  }

  return key;
}

function hashRequest(input: CreateStoryInput): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
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

export const storyService = new StoryService();
