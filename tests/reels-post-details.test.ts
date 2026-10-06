import { describe, expect, it } from 'vitest';

import { createReelBodySchema } from '../src/modules/reels/reel.validation.js';
import { toReelStatusDto, toReelFeedItemDto } from '../src/modules/reels/reel.mapper.js';
import { Types } from 'mongoose';

describe('Reels Post Details & Media Edit Schema', () => {
  it('validates post creation input with hashtags, mentions, location, and overlay text', () => {
    const valid = createReelBodySchema.parse({
      mediaAssetId: '640000000000000000000101',
      mediaType: 'video',
      caption: 'Awesome day! #nightlife #dance #noir',
      hashtags: ['#party', 'fun'],
      mentions: ['640000000000000000000102'],
      location: {
        name: 'Central Park',
        latitude: 40.785091,
        longitude: -73.968285,
      },
      forKids: false,
      audio: {
        originalVolume: 50,
        musicVolume: 50,
      },
      videoEdit: {
        filter: 'none',
        effect: 'none',
        exposure: 50,
        contrast: 50,
        overlayText: {
          text: 'Good morning',
          x: 0.5,
          y: 0.2,
          fontSize: 42,
        },
      },
    });

    expect(valid.mediaType).toBe('video');
    expect(valid.caption).toBe('Awesome day! #nightlife #dance #noir');
    expect(valid.hashtags).toEqual(['party', 'fun']);
    expect(valid.mentions).toEqual(['640000000000000000000102']);
    expect(valid.location?.name).toBe('Central Park');
    expect(valid.audio.originalVolume).toBe(50);
    expect(valid.audio.musicVolume).toBe(50);
  });

  it('maps post details with hashtags, mentions, location, and mediaType correctly to DTOs', () => {
    const mockReel: any = {
      _id: new Types.ObjectId('640000000000000000000201'),
      ownerId: new Types.ObjectId('640000000000000000000202'),
      status: 'READY',
      progress: 100,
      caption: 'Hello #world',
      hashtags: ['world', 'nightlife'],
      mentions: [new Types.ObjectId('640000000000000000000203')],
      location: { name: 'Times Square', latitude: 40.758, longitude: -73.9855 },
      mediaType: 'photo',
      visibility: 'PUBLIC',
      forKids: false,
      rawMedia: {
        mediaAssetId: new Types.ObjectId(),
        provider: 'cloudinary',
        publicId: 'test_raw',
        version: 1,
        secureUrl: 'https://example.com/raw.jpg',
        width: 1080,
        height: 1920,
        durationMs: 5000,
        fileSizeBytes: 1024,
        mimeType: 'image/jpeg',
      },
      processedMedia: {
        provider: 'cloudinary',
        publicId: 'test_proc',
        version: 1,
        secureUrl: 'https://example.com/proc.jpg',
        fileSizeBytes: 1024,
        width: 1080,
        height: 1920,
        durationMs: 5000,
        format: 'jpg',
      },
      thumbnail: {
        provider: 'cloudinary',
        publicId: 'test_thumb',
        version: 1,
        secureUrl: 'https://example.com/thumb.jpg',
        width: 1080,
        height: 1920,
      },
      audioEdit: {
        originalVolume: 80,
        musicVolume: 20,
        music: null,
      },
      videoEdit: {
        trimStartMs: 0,
        trimEndMs: 5000,
        filter: 'none',
        effect: 'none',
        exposure: 50,
        contrast: 50,
      },
      processing: { attempts: 1, retryCount: 0, queueSubmissionState: 'submitted', cancelRequested: false },
      idempotencyKey: 'key_123',
      requestHash: 'hash_123',
      viewCount: 100,
      likeCount: 15,
      commentCount: 3,
      shareCount: 1,
      createdAt: new Date('2026-08-01T00:00:00Z'),
      publishedAt: new Date('2026-08-01T00:01:00Z'),
    };

    const statusDto = toReelStatusDto(mockReel);
    expect(statusDto.mediaType).toBe('photo');
    expect(statusDto.hashtags).toEqual(['world', 'nightlife']);
    expect(statusDto.mentions).toEqual(['640000000000000000000203']);
    expect(statusDto.location?.name).toBe('Times Square');
    expect(statusDto.edit.originalVolume).toBe(80);
    expect(statusDto.edit.musicVolume).toBe(20);

    const feedDto = toReelFeedItemDto(mockReel as any);
    expect(feedDto.mediaType).toBe('photo');
    expect(feedDto.upload.mediaAssetId).toBe(mockReel.rawMedia.mediaAssetId.toString());
    expect(feedDto.upload.publicId).toBe('test_raw');
    expect(feedDto.upload.secureUrl).toBe('https://example.com/raw.jpg');
    expect(feedDto.hashtags).toEqual(['world', 'nightlife']);
    expect(feedDto.location?.name).toBe('Times Square');
  });
});
