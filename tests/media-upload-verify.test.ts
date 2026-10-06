import { Types } from 'mongoose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/jesusname7_test';
delete process.env.REDIS_URL;

let MediaAssetAttachmentStatus: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetAttachmentStatus;
let MediaAssetPurpose: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetPurpose;
let MediaAssetUploadStatus: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaAssetUploadStatus;
let MediaType: typeof import('../src/modules/media-assets/media-asset.constants.js').MediaType;
let MediaAssetService: typeof import('../src/modules/media-assets/media-asset.service.js').MediaAssetService;

beforeAll(async () => {
  ({
    MediaAssetAttachmentStatus,
    MediaAssetPurpose,
    MediaAssetUploadStatus,
    MediaType,
  } = await import('../src/modules/media-assets/media-asset.constants.js'));
  ({ MediaAssetService } = await import('../src/modules/media-assets/media-asset.service.js'));
});

describe('media upload verification', () => {
  it('retries Cloudinary metadata until video duration becomes available', async () => {
    vi.useFakeTimers();

    const ownerId = new Types.ObjectId();
    const uploadId = new Types.ObjectId();
    const getAsset = vi
      .fn()
      .mockResolvedValueOnce({
        assetId: 'asset-1',
        publicId: 'jesusname7/reels/raw/user/video',
        secureUrl: 'https://res.cloudinary.com/demo/video/upload/v1/video.mp4',
        resourceType: 'video',
        bytes: 1_000_000,
        version: 1,
        createdAt: new Date().toISOString(),
        format: 'mp4',
        width: 1080,
        height: 1920,
      })
      .mockResolvedValueOnce({
        assetId: 'asset-1',
        publicId: 'jesusname7/reels/raw/user/video',
        secureUrl: 'https://res.cloudinary.com/demo/video/upload/v1/video.mp4',
        resourceType: 'video',
        bytes: 1_000_000,
        version: 1,
        createdAt: new Date().toISOString(),
        format: 'mp4',
        width: 1080,
        height: 1920,
        duration: 12.5,
      });

    const repository = {
      findById: vi.fn().mockResolvedValue({
        _id: uploadId,
        ownerId,
        publicId: 'jesusname7/reels/raw/user/video',
        mediaType: MediaType.VIDEO,
        purpose: MediaAssetPurpose.REEL,
        mimeType: 'video/mp4',
        uploadStatus: MediaAssetUploadStatus.PENDING,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
        expiresAt: new Date(Date.now() + 60_000),
      }),
      markVerified: vi.fn().mockImplementation(async () => ({
        _id: uploadId,
        ownerId,
        publicId: 'jesusname7/reels/raw/user/video',
        mediaType: MediaType.VIDEO,
        purpose: MediaAssetPurpose.REEL,
        mimeType: 'video/mp4',
        uploadStatus: MediaAssetUploadStatus.VERIFIED,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
        secureUrl: 'https://res.cloudinary.com/demo/video/upload/v1/video.mp4',
        durationSeconds: 12.5,
        width: 1080,
        height: 1920,
        fileSizeBytes: 1_000_000,
        expiresAt: new Date(Date.now() + 60_000),
        verifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };

    const storage = {
      getAsset,
      createThumbnailUrl: vi.fn().mockReturnValue('https://res.cloudinary.com/demo/video/upload/c_thumb/video.jpg'),
    };

    const service = new MediaAssetService(repository as never, storage as never);
    const completePromise = service.complete(ownerId.toString(), uploadId.toString());

    await vi.runAllTimersAsync();
    const result = await completePromise;

    expect(getAsset).toHaveBeenCalledTimes(2);
    expect(result.durationMs).toBe(12_500);

    vi.useRealTimers();
  });
});
