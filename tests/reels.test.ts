import { Types } from 'mongoose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/jesusname7_test';
process.env.REEL_MIN_DURATION_MS = '1000';
process.env.REEL_MAX_DURATION_MS = '60000';
process.env.REEL_RAW_VIDEO_MAX_DURATION_MS = '180000';
delete process.env.REDIS_URL;

let MediaAssetAttachmentStatus: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetAttachmentStatus;
let MediaAssetPurpose: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetPurpose;
let MediaAssetUploadStatus: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetUploadStatus;
let MediaType: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaType;
let ReelService: typeof import('../src/modules/reels/reel.service.js').ReelService;
let createReelBodySchema: typeof import('../src/modules/reels/reel.validation.js').createReelBodySchema;
let prepareUploadBodySchema: typeof import('../src/modules/media-assets/media-asset.validation.js').prepareUploadBodySchema;
let decodeReelCursor: typeof import('../src/modules/reels/reel-cursor.js').decodeReelCursor;
let encodeReelCursor: typeof import('../src/modules/reels/reel-cursor.js').encodeReelCursor;
let buildReelFfmpegGraph: typeof import('../src/infrastructure/media/reel-ffmpeg-graph.js').buildReelFfmpegGraph;
let volumePercentToMultiplier: typeof import('../src/modules/reels/reel.constants.js').volumePercentToMultiplier;
let mapExposureToFfmpeg: typeof import('../src/modules/reels/reel.constants.js').mapExposureToFfmpeg;
let reelJobId: typeof import('../src/modules/reels/reel.constants.js').reelJobId;
let ReelStatus: typeof import('../src/modules/reels/reel.constants.js').ReelStatus;
let ReelQueueSubmissionState: typeof import('../src/modules/reels/reel.constants.js').ReelQueueSubmissionState;

beforeAll(async () => {
  ({
    MediaAssetAttachmentStatus,
    MediaAssetPurpose,
    MediaAssetUploadStatus,
    MediaType,
  } = await import('../src/modules/media-assets/media-asset.constants.js'));
  ({ ReelService } = await import('../src/modules/reels/reel.service.js'));
  ({ createReelBodySchema } = await import('../src/modules/reels/reel.validation.js'));
  ({ prepareUploadBodySchema } = await import('../src/modules/media-assets/media-asset.validation.js'));
  ({ decodeReelCursor, encodeReelCursor } = await import('../src/modules/reels/reel-cursor.js'));
  ({ buildReelFfmpegGraph } = await import('../src/infrastructure/media/reel-ffmpeg-graph.js'));
  ({
    volumePercentToMultiplier,
    mapExposureToFfmpeg,
    reelJobId,
    ReelStatus,
    ReelQueueSubmissionState,
  } = await import('../src/modules/reels/reel.constants.js'));
});

describe('reel contracts and services', () => {
  it('prepares reel uploads with purpose and rejects non-video', () => {
    expect(
      prepareUploadBodySchema.parse({
        fileName: 'my reel.mp4',
        mediaType: 'video',
        mimeType: 'video/mp4',
        fileSizeBytes: 1_000_000,
        purpose: 'reel',
      }),
    ).toMatchObject({
      mediaType: 'video',
      purpose: 'reel',
      mimeType: 'video/mp4',
    });

    expect(
      prepareUploadBodySchema.safeParse({
        mediaType: 'image',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1000,
        purpose: 'reel',
      }).success,
    ).toBe(false);
  });

  it('rejects client musicUrl, arbitrary media URLs, invalid volumes, and unknown filters', () => {
    const mediaAssetId = new Types.ObjectId().toString();

    expect(
      createReelBodySchema.safeParse({
        mediaAssetId,
        musicUrl: 'https://evil.example/track.mp3',
      }).success,
    ).toBe(false);

    expect(
      createReelBodySchema.safeParse({
        mediaAssetId,
        mediaUrl: 'https://evil.example/video.mp4',
      }).success,
    ).toBe(false);

    expect(
      createReelBodySchema.safeParse({
        mediaAssetId,
        audio: { originalVolume: 101, musicVolume: 50 },
      }).success,
    ).toBe(false);

    expect(
      createReelBodySchema.safeParse({
        mediaAssetId,
        audio: { originalVolume: -1, musicVolume: 50 },
      }).success,
    ).toBe(false);

    expect(
      createReelBodySchema.safeParse({
        mediaAssetId,
        videoEdit: { filter: 'eq=brightness=1', effect: 'none' },
      }).success,
    ).toBe(false);

    expect(
      createReelBodySchema.safeParse({
        mediaAssetId,
        videoEdit: { filter: 'vivid', effect: 'sparkle' },
      }).success,
    ).toBe(false);
  });

  it('accepts valid reel create payload and converts volumes for ffmpeg', () => {
    const parsed = createReelBodySchema.parse({
      mediaAssetId: new Types.ObjectId().toString(),
      caption: 'Hello',
      audio: {
        originalVolume: 70,
        musicVolume: 90,
        musicId: '123',
        musicTrim: { startMs: 9000, endMs: 17000 },
      },
      videoEdit: {
        trim: { startMs: 0, endMs: 8000 },
        filter: 'vivid',
        effect: 'none',
        exposure: 55,
        contrast: 60,
        overlayText: { text: 'Hello; rm -rf /', x: 0.5, y: 0.2, fontSize: 42 },
      },
    });

    expect(parsed.audio.originalVolume).toBe(70);
    expect(volumePercentToMultiplier(70)).toBe(0.7);
    expect(volumePercentToMultiplier(90)).toBe(0.9);
    expect(mapExposureToFfmpeg(50)).toBe(0);
    expect(parsed.videoEdit.overlayText?.text).toContain('Hello');
  });

  it('round-trips reel cursors and builds deterministic job ids', () => {
    const id = new Types.ObjectId();
    const publishedAt = new Date('2026-08-04T00:00:00.000Z');
    const cursor = encodeReelCursor({ id, publishedAt });

    expect(decodeReelCursor(cursor)).toEqual({ id, publishedAt });
    expect(reelJobId(id.toString())).toBe(`reel:${id.toString()}`);
  });

  it('builds ffmpeg argv arrays without shell concatenation', () => {
    const ownerId = new Types.ObjectId();
    const reelId = new Types.ObjectId();
    const graph = buildReelFfmpegGraph({
      reel: {
        _id: reelId,
        ownerId,
        videoEdit: {
          trimStartMs: 0,
          trimEndMs: 8000,
          filter: 'vivid',
          effect: 'none',
          exposure: 50,
          contrast: 50,
          overlayText: { text: "O'Brien $(reboot)", x: 0.5, y: 0.2, fontSize: 42 },
        },
        audioEdit: {
          originalVolume: 70,
          musicVolume: 90,
          music: {
            provider: 'jamendo',
            providerTrackId: '1',
            title: 't',
            artistName: 'a',
            audioSourceUrl: 'https://example.com/a.mp3',
            trackDurationMs: 60_000,
            downloadAllowed: true,
            trimStartMs: 9000,
            trimEndMs: 17000,
            volume: 90,
            verifiedAt: new Date(),
          },
        },
      } as never,
      rawVideoPath: '/tmp/raw.mp4',
      musicPath: '/tmp/music.mp3',
      hasOriginalAudio: true,
      outputVideoPath: '/tmp/out.mp4',
    });

    expect(Array.isArray(graph.args)).toBe(true);
    expect(graph.args.includes('-filter_complex')).toBe(true);
    expect(graph.args.includes('+faststart')).toBe(true);
    expect(graph.args.some((arg) => arg.includes('volume=0.7'))).toBe(true);
    expect(graph.args.some((arg) => arg.includes('volume=0.9'))).toBe(true);
    expect(graph.args.join(' ')).not.toContain('$(reboot)');
  });

  it('creates a reel transactionally, enqueues once, and replays idempotency', async () => {
    const ownerId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const reelId = new Types.ObjectId();
    let created: Record<string, unknown> | undefined;
    const enqueue = vi.fn().mockResolvedValue(`reel:${reelId.toString()}`);

    const reels = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (record: Record<string, unknown>) => {
        created = {
          ...record,
          _id: reelId,
          viewCount: 0,
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return created;
      }),
      findById: vi.fn(async () => created),
      markQueueSubmitted: vi.fn().mockResolvedValue(created),
      markQueueSubmissionFailed: vi.fn(),
    };
    const mediaAssets = {
      findById: vi.fn().mockResolvedValue({
        _id: assetId,
        ownerId,
        provider: 'cloudinary',
        publicId: 'jesusname7/reels/raw/asset',
        version: 1,
        purpose: MediaAssetPurpose.REEL,
        resourceType: MediaType.VIDEO,
        mediaType: MediaType.VIDEO,
        secureUrl: 'https://res.cloudinary.com/demo/video/upload/v1/raw.mp4',
        mimeType: 'video/mp4',
        declaredFileSizeBytes: 5_000_000,
        fileSizeBytes: 5_000_000,
        width: 1080,
        height: 1920,
        durationSeconds: 12,
        uploadStatus: MediaAssetUploadStatus.VERIFIED,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
        uploadSignatureId: 'sig',
        expiresAt: new Date(Date.now() + 60_000),
        cleanupAttemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      attachToReel: vi.fn().mockResolvedValue(true),
    };
    const music = {
      getTrackById: vi.fn().mockResolvedValue({
        provider: 'jamendo',
        providerTrackId: '99',
        title: 'Track',
        artistName: 'Artist',
        albumName: null,
        coverImageUrl: null,
        audioPreviewUrl: 'https://example.com/preview.mp3',
        durationSeconds: 120,
        shareUrl: null,
        licenseUrl: 'https://example.com/license',
        downloadAllowed: true,
        downloadUrl: 'https://example.com/download.mp3',
      }),
    };

    const service = new ReelService(
      reels as never,
      mediaAssets as never,
      music as never,
      async (operation) => operation({} as never),
      enqueue,
      vi.fn(),
    );

    const result = await service.create(ownerId.toString(), 'reel-key-001', {
      mediaAssetId: assetId.toString(),
      caption: 'My reel',
      visibility: 'public',
      forKids: false,
      audio: {
        originalVolume: 70,
        musicVolume: 90,
        musicId: '99',
        musicTrim: { startMs: 0, endMs: 10_000 },
      },
      videoEdit: {
        trim: { startMs: 0, endMs: 8_000 },
        filter: 'none',
        effect: 'none',
        exposure: 50,
        contrast: 50,
      },
    });

    expect(result.reelId).toBe(reelId.toString());
    expect(result.status).toBe(ReelStatus.QUEUED);
    expect(reels.create).toHaveBeenCalledOnce();
    expect(mediaAssets.attachToReel).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(reelId.toString());

    const existingHash = created!.requestHash as string;
    const conflictService = new ReelService(
      {
        findByIdempotencyKey: vi.fn().mockResolvedValue({
          _id: reelId,
          status: ReelStatus.QUEUED,
          progress: 0,
          requestHash: existingHash,
        }),
      } as never,
      mediaAssets as never,
      music as never,
      async (operation) => operation({} as never),
      enqueue,
      vi.fn(),
    );

    await expect(
      conflictService.create(ownerId.toString(), 'reel-key-001', {
        mediaAssetId: assetId.toString(),
        caption: 'Different payload',
        visibility: 'public',
        forKids: false,
        audio: { originalVolume: 100, musicVolume: 100 },
        videoEdit: {
          filter: 'none',
          effect: 'none',
          exposure: 50,
          contrast: 50,
        },
      }),
    ).rejects.toMatchObject({ code: 'REEL_IDEMPOTENCY_CONFLICT' });
  });

  it('rejects non-downloadable music for ffmpeg rendering', async () => {
    const ownerId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const service = new ReelService(
      { findByIdempotencyKey: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      {
        getTrackById: vi.fn().mockResolvedValue({
          provider: 'jamendo',
          providerTrackId: '1',
          title: 'Track',
          artistName: 'Artist',
          albumName: null,
          coverImageUrl: null,
          audioPreviewUrl: 'https://example.com/preview.mp3',
          durationSeconds: 120,
          shareUrl: null,
          licenseUrl: null,
          downloadAllowed: false,
          downloadUrl: null,
        }),
      } as never,
      async (operation) => operation({} as never),
      vi.fn(),
      vi.fn(),
    );

    await expect(
      service.create(ownerId.toString(), 'reel-key-music', {
        mediaAssetId: assetId.toString(),
        visibility: 'public',
        forKids: false,
        audio: {
          originalVolume: 100,
          musicVolume: 80,
          musicId: '1',
          musicTrim: { startMs: 0, endMs: 8_000 },
        },
        videoEdit: {
          trim: { startMs: 0, endMs: 8_000 },
          filter: 'none',
          effect: 'none',
          exposure: 50,
          contrast: 50,
        },
      }),
    ).rejects.toMatchObject({ code: 'MUSIC_PROCESSING_NOT_ALLOWED' });
  });

  it('marks queue submission failures as recoverable', async () => {
    const ownerId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const reelId = new Types.ObjectId();
    const created = {
      _id: reelId,
      ownerId,
      status: ReelStatus.QUEUED,
      progress: 0,
      processing: {
        attempts: 0,
        retryCount: 0,
        queueSubmissionState: ReelQueueSubmissionState.PENDING,
        cancelRequested: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const reels = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
      findById: vi.fn().mockResolvedValue(created),
      markQueueSubmitted: vi.fn(),
      markQueueSubmissionFailed: vi.fn(),
    };
    const mediaAssets = {
      findById: vi.fn().mockResolvedValue({
        _id: assetId,
        ownerId,
        provider: 'cloudinary',
        publicId: 'jesusname7/reels/raw/asset',
        version: 1,
        purpose: MediaAssetPurpose.REEL,
        resourceType: MediaType.VIDEO,
        mediaType: MediaType.VIDEO,
        secureUrl: 'https://res.cloudinary.com/demo/video/upload/v1/raw.mp4',
        mimeType: 'video/mp4',
        declaredFileSizeBytes: 5_000_000,
        fileSizeBytes: 5_000_000,
        width: 1080,
        height: 1920,
        durationSeconds: 12,
        uploadStatus: MediaAssetUploadStatus.VERIFIED,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      attachToReel: vi.fn().mockResolvedValue(true),
    };

    const service = new ReelService(
      reels as never,
      mediaAssets as never,
      { getTrackById: vi.fn() } as never,
      async (operation) => operation({} as never),
      vi.fn().mockRejectedValue(new Error('redis down')),
      vi.fn(),
    );

    const result = await service.create(ownerId.toString(), 'reel-key-queue', {
      mediaAssetId: assetId.toString(),
      visibility: 'public',
      forKids: false,
      audio: { originalVolume: 100, musicVolume: 0 },
      videoEdit: {
        trim: { startMs: 0, endMs: 8_000 },
        filter: 'none',
        effect: 'none',
        exposure: 50,
        contrast: 50,
      },
    });

    expect(result.reelId).toBe(reelId.toString());
    expect(reels.markQueueSubmissionFailed).toHaveBeenCalledOnce();
  });

  it('excludes non-ready reels from feed mapping expectations', async () => {
    const readyId = new Types.ObjectId();
    const reels = {
      listReadyPublic: vi.fn().mockResolvedValue([
        {
          _id: readyId,
          ownerId: {
            _id: new Types.ObjectId(),
            profile: { username: 'ratul', photoUrl: 'https://cdn.example.com/a.jpg' },
          },
          caption: 'Ready',
          likeCount: 1,
          commentCount: 0,
          shareCount: 0,
          viewCount: 3,
          createdAt: new Date(),
          publishedAt: new Date(),
          processedMedia: {
            secureUrl: 'https://cdn.example.com/ready.mp4',
            durationMs: 8000,
          },
          thumbnail: { secureUrl: 'https://cdn.example.com/ready.jpg' },
        },
      ]),
    };

    const service = new ReelService(
      reels as never,
      {} as never,
      {} as never,
      async (operation) => operation({} as never),
      vi.fn(),
      vi.fn(),
    );

    const feed = await service.getFeed({ limit: 20 });
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]?.videoUrl).toContain('ready.mp4');
    expect(feed.items[0]?.videoUrl).not.toContain('raw');
  });
});
