import { beforeAll, describe, expect, it, vi } from 'vitest';

import { LIVE_STREAM_FEED_TAB, LIVE_STREAM_STATUS } from '../src/modules/live-streams/live-stream.constants.js';
import {
  createLiveStreamSchema,
  liveStreamFeedQuerySchema,
  postLiveStreamCommentSchema,
} from '../src/modules/live-streams/live-stream.validation.js';
import { LiveStreamService } from '../src/modules/live-streams/live-stream.service.js';
import { AppError } from '../src/common/errors/app-error.js';

describe('Live Streaming Module', () => {
  describe('Validations', () => {
    it('validates live stream creation payload', () => {
      const valid = createLiveStreamSchema.parse({
        title: 'Gaming Championship Live Stream',
        description: 'Watch the finals!',
        category: 'Gaming',
      });

      expect(valid.title).toBe('Gaming Championship Live Stream');
      expect(valid.category).toBe('Gaming');

      expect(createLiveStreamSchema.safeParse({ title: '' }).success).toBe(false);
      expect(
        createLiveStreamSchema.safeParse({ title: 'A'.repeat(121) }).success,
      ).toBe(false);
    });

    it('validates feed query parameters and defaults', () => {
      const parsed = liveStreamFeedQuerySchema.parse({
        tab: 'live',
        category: 'Music',
        page: '2',
        limit: '15',
      });

      expect(parsed).toEqual({
        tab: 'live',
        category: 'Music',
        page: 2,
        limit: 15,
      });

      expect(
        liveStreamFeedQuerySchema.safeParse({ tab: 'invalid_tab' }).success,
      ).toBe(false);
    });

    it('validates live stream comment text', () => {
      expect(postLiveStreamCommentSchema.parse({ text: 'Awesome clutch! 🔥' }).text).toBe(
        'Awesome clutch! 🔥',
      );
      expect(postLiveStreamCommentSchema.safeParse({ text: '' }).success).toBe(false);
    });
  });

  describe('LiveStreamService', () => {
    let service: LiveStreamService;
    let mockRepo: any;

    const mockStream: any = {
      _id: { toString: () => '640000000000000000000001' },
      hostId: {
        _id: { toString: () => 'user123' },
        username: 'diannewilson',
        displayName: 'Dianne Wilson',
        avatarUrl: 'https://example.com/avatar.jpg',
        isVerified: true,
      },
      title: 'Dianne Live Stream',
      description: 'Join my channel!',
      coverImage: 'https://example.com/cover.jpg',
      status: LIVE_STREAM_STATUS.SCHEDULED,
      channelName: 'live_test_channel',
      streamKey: 'sk_secret',
      viewerCount: 0,
      peakViewerCount: 0,
      likesCount: 10,
      giftsCount: 0,
      category: 'General',
      createdAt: new Date('2026-08-01T00:00:00Z'),
    };

    beforeAll(() => {
      mockRepo = {
        create: vi.fn().mockResolvedValue(mockStream),
        findById: vi.fn().mockResolvedValue(mockStream),
        updateStatus: vi.fn().mockImplementation((id, status, fields) =>
          Promise.resolve({ ...mockStream, status, ...fields }),
        ),
        findFeedStreams: vi.fn().mockResolvedValue({ streams: [mockStream], total: 1 }),
        incrementViewerCount: vi.fn().mockResolvedValue({ ...mockStream, viewerCount: 1, peakViewerCount: 1 }),
        decrementViewerCount: vi.fn().mockResolvedValue({ ...mockStream, viewerCount: 0 }),
        incrementLikesCount: vi.fn().mockResolvedValue({ ...mockStream, likesCount: 11 }),
        addComment: vi.fn().mockResolvedValue({
          _id: { toString: () => 'comment123' },
          streamId: '640000000000000000000001',
          userId: {
            _id: { toString: () => 'user456' },
            username: 'jenny',
            displayName: 'Jenny',
            isVerified: true,
          },
          text: 'Awesome clutch 👌👌',
          createdAt: new Date('2026-08-01T00:01:00Z'),
        }),
        getRecentComments: vi.fn().mockResolvedValue([]),
      };

      service = new LiveStreamService(mockRepo, {
        appId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        appCertificate: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        tokenTtlSeconds: 3_600,
      });
    });

    it('creates a live stream with channel name and stream key', async () => {
      const result = await service.createStream('user123', {
        title: 'Dianne Live Stream',
        description: 'Join my channel!',
      });

      expect(mockRepo.create).toHaveBeenCalled();
      expect(result.title).toBe('Dianne Live Stream');
      expect(result.host.username).toBe('diannewilson');
      expect(result.status).toBe(LIVE_STREAM_STATUS.SCHEDULED);
    });

    it('starts a live stream when called by host', async () => {
      const started = await service.startStream('640000000000000000000001', 'user123');
      expect(started.status).toBe(LIVE_STREAM_STATUS.LIVE);
      expect(started.startedAt).toBeDefined();
    });

    it('prevents non-host users from starting a stream', async () => {
      await expect(
        service.startStream('640000000000000000000001', 'unauthorized_user'),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    it('ends a live stream when called by host', async () => {
      const ended = await service.endStream('640000000000000000000001', 'user123');
      expect(ended.status).toBe(LIVE_STREAM_STATUS.ENDED);
    });

    it('generates stream token for viewers and hosts', async () => {
      const hostToken = await service.getStreamToken('640000000000000000000001', 'user123');
      expect(hostToken.role).toBe('host');
      expect(hostToken.token).toBeDefined();

      mockRepo.findById.mockResolvedValueOnce({ ...mockStream, status: LIVE_STREAM_STATUS.LIVE });
      const viewerToken = await service.getStreamToken('640000000000000000000001', 'viewer789');
      expect(viewerToken.role).toBe('viewer');
    });

    it('fetches stream feed items with pagination', async () => {
      const feed = await service.getFeed({ tab: LIVE_STREAM_FEED_TAB.LIVE, page: 1, limit: 10 });
      expect(feed.items).toHaveLength(1);
      expect(feed.pagination.total).toBe(1);
      expect(feed.items[0]?.title).toBe('Dianne Live Stream');
    });

    it('posts comments to a live stream', async () => {
      mockRepo.findById.mockResolvedValueOnce({ ...mockStream, status: LIVE_STREAM_STATUS.LIVE });
      const comment = await service.addComment(
        '640000000000000000000001',
        'user456',
        'Awesome clutch 👌👌',
      );
      expect(comment.text).toBe('Awesome clutch 👌👌');
      expect(comment.user.username).toBe('jenny');
    });

    it('increments heart likes on a live stream', async () => {
      mockRepo.findById.mockResolvedValueOnce({ ...mockStream, status: LIVE_STREAM_STATUS.LIVE });
      const likeResult = await service.addLike('640000000000000000000001');
      expect(likeResult.likesCount).toBe(11);
    });
  });
});
