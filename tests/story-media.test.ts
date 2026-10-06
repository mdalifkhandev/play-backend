import { Types } from 'mongoose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/jesusname7_test';
process.env.STORY_IMAGE_MIN_DISPLAY_SECONDS = '3';
process.env.STORY_IMAGE_MAX_DISPLAY_SECONDS = '30';
delete process.env.REDIS_URL;

let MediaAssetAttachmentStatus: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetAttachmentStatus;
let MediaAssetUploadStatus: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetUploadStatus;
let MediaType: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaType;
let StoryService: typeof import('../src/modules/stories/story.service.js').StoryService;
let createStoryBodySchema: typeof import('../src/modules/stories/story.validation.js').createStoryBodySchema;
let decodeStoryCursor: typeof import('../src/modules/stories/story-cursor.js').decodeStoryCursor;
let encodeStoryCursor: typeof import('../src/modules/stories/story-cursor.js').encodeStoryCursor;
let prepareUploadBodySchema: typeof import('../src/modules/media-assets/media-asset.validation.js').prepareUploadBodySchema;

beforeAll(async () => {
  ({ MediaAssetAttachmentStatus, MediaAssetUploadStatus, MediaType } = await import(
    '../src/modules/media-assets/media-asset.constants.js'
  ));
  ({ StoryService } = await import('../src/modules/stories/story.service.js'));
  ({ createStoryBodySchema } = await import('../src/modules/stories/story.validation.js'));
  ({ decodeStoryCursor, encodeStoryCursor } = await import('../src/modules/stories/story-cursor.js'));
  ({ prepareUploadBodySchema } = await import('../src/modules/media-assets/media-asset.validation.js'));
});

describe('story and media contracts', () => {
  it('validates Story upload preparation inputs', () => {
    expect(
      prepareUploadBodySchema.parse({
        mediaType: 'image',
        mimeType: ' IMAGE/JPEG ',
        fileSizeBytes: '512',
      }),
    ).toEqual({
      mediaType: 'image',
      mimeType: 'image/jpeg',
      fileSizeBytes: 512,
      purpose: 'story',
    });

    expect(
      prepareUploadBodySchema.safeParse({
        mediaType: 'audio',
        mimeType: 'audio/mpeg',
        fileSizeBytes: 512,
      }).success,
    ).toBe(false);
  });

  it('rejects invalid video editing metadata before service execution', () => {
    expect(
      createStoryBodySchema.safeParse({
        mediaAssetId: new Types.ObjectId().toString(),
        mediaType: 'video',
        videoEditing: {
          trimStartSeconds: 10,
          trimEndSeconds: 9,
          originalAudioEnabled: false,
          originalAudioVolume: 1,
        },
      }).success,
    ).toBe(false);
  });

  it('round-trips feed cursors and maps bad cursors to a clean error', () => {
    const id = new Types.ObjectId();
    const publishedAt = new Date('2026-08-02T00:00:00.000Z');
    const cursor = encodeStoryCursor({ id, publishedAt });

    expect(decodeStoryCursor(cursor)).toEqual({ id, publishedAt });
    expect(() => decodeStoryCursor('bad-cursor')).toThrow('Story cursor is invalid.');
  });

  it('publishes an image Story with an idempotent transaction', async () => {
    const ownerId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const storyId = new Types.ObjectId();
    let createdStory: Record<string, unknown> | undefined;

    const stories = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (record: Record<string, unknown>) => {
        createdStory = {
          ...record,
          _id: storyId,
          viewCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return createdStory;
      }),
      findActivePublicById: vi.fn(async () => ({
        ...createdStory,
        ownerId: {
          _id: ownerId,
          profile: { displayName: 'Ratul', username: 'ratul990054', photoUrl: 'https://cdn.example.com/a.jpg' },
        },
      })),
    };
    const mediaAssets = {
      findById: vi.fn().mockResolvedValue({
        _id: assetId,
        ownerId,
        provider: 'cloudinary',
        publicId: 'jesusname7/stories/asset',
        version: 1,
        resourceType: MediaType.IMAGE,
        mediaType: MediaType.IMAGE,
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/story.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/demo/image/upload/c_thumb/story.jpg',
        mimeType: 'image/jpeg',
        declaredFileSizeBytes: 500,
        fileSizeBytes: 500,
        width: 1080,
        height: 1920,
        uploadStatus: MediaAssetUploadStatus.VERIFIED,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
        purpose: 'story',
        uploadSignatureId: 'sig',
        expiresAt: new Date(Date.now() + 60_000),
        cleanupAttemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      attachToStory: vi.fn().mockResolvedValue(true),
    };
    const music = { getTrackById: vi.fn() };
    const service = new StoryService(
      stories as never,
      mediaAssets as never,
      music as never,
      async (operation) => operation({} as never),
    );

    const result = await service.create(ownerId.toString(), 'story-key-001', {
      mediaAssetId: assetId.toString(),
      mediaType: MediaType.IMAGE,
      displayDurationSeconds: 5,
      caption: 'Hello',
    });

    expect(result.replayed).toBe(false);
    expect(result.story.id).toBe(storyId.toString());
    expect(result.story.owner.name).toBe('Ratul');
    expect(result.story.media.mediaAssetId).toBe(assetId.toString());
    expect(stories.create).toHaveBeenCalledOnce();
    expect(mediaAssets.attachToStory).toHaveBeenCalledOnce();
  });

  it('prevents publishing media owned by another user', async () => {
    const ownerId = new Types.ObjectId();
    const otherOwnerId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const service = new StoryService(
      { findByIdempotencyKey: vi.fn().mockResolvedValue(null) } as never,
      {
        findById: vi.fn().mockResolvedValue({
          _id: assetId,
          ownerId: otherOwnerId,
          uploadStatus: MediaAssetUploadStatus.VERIFIED,
          attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
          expiresAt: new Date(Date.now() + 60_000),
          mediaType: MediaType.IMAGE,
        }),
      } as never,
      { getTrackById: vi.fn() } as never,
      async (operation) => operation({} as never),
    );

    await expect(
      service.create(ownerId.toString(), 'story-key-002', {
        mediaAssetId: assetId.toString(),
        mediaType: MediaType.IMAGE,
        displayDurationSeconds: 5,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'UPLOAD_NOT_OWNED' });
  });
});
