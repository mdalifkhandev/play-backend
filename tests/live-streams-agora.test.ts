import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LiveStreamService } from '../src/modules/live-streams/live-stream.service.js';
import { liveStreamRepository } from '../src/modules/live-streams/live-stream.repository.js';
import { LIVE_STREAM_ROLE, LIVE_STREAM_STATUS } from '../src/modules/live-streams/live-stream.constants.js';
import mongoose from 'mongoose';

const testAgoraConfig = {
  appId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  appCertificate: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  tokenTtlSeconds: 3_600,
};

describe('Live Video Streams & Agora RTC Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Agora RTC Token Generation', () => {
    it('generates an Agora RTC Publisher token for the live stream host', async () => {
      const hostUserId = new mongoose.Types.ObjectId().toString();
      const streamId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(liveStreamRepository, 'findById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: new mongoose.Types.ObjectId(hostUserId),
        channelName: 'live_test_channel_123',
        status: LIVE_STREAM_STATUS.LIVE,
      } as any);

      const service = new LiveStreamService(liveStreamRepository, testAgoraConfig);
      const res = await service.getStreamToken(streamId, hostUserId);

      expect(res).toMatchObject({
        appId: testAgoraConfig.appId,
        channelName: 'live_test_channel_123',
        role: LIVE_STREAM_ROLE.HOST,
        expiresInSeconds: 3600,
      });

      expect(res.token).toBeDefined();
      expect(typeof res.token).toBe('string');
      expect(typeof res.uid).toBe('number');
    });

    it('generates an Agora RTC Subscriber token for a live stream viewer', async () => {
      const hostUserId = new mongoose.Types.ObjectId().toString();
      const viewerUserId = new mongoose.Types.ObjectId().toString();
      const streamId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(liveStreamRepository, 'findById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: new mongoose.Types.ObjectId(hostUserId),
        channelName: 'live_test_channel_123',
        status: LIVE_STREAM_STATUS.LIVE,
      } as any);

      const service = new LiveStreamService(liveStreamRepository, testAgoraConfig);
      const res = await service.getStreamToken(streamId, viewerUserId);

      expect(res).toMatchObject({
        appId: testAgoraConfig.appId,
        channelName: 'live_test_channel_123',
        role: LIVE_STREAM_ROLE.VIEWER,
        expiresInSeconds: 3600,
      });

      expect(res.token).toBeDefined();
      expect(typeof res.token).toBe('string');
      expect(typeof res.uid).toBe('number');
    });

    it('does not issue viewer tokens before a stream starts', async () => {
      const hostUserId = new mongoose.Types.ObjectId().toString();
      const viewerUserId = new mongoose.Types.ObjectId().toString();
      const streamId = new mongoose.Types.ObjectId().toString();
      vi.spyOn(liveStreamRepository, 'findById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: new mongoose.Types.ObjectId(hostUserId),
        channelName: 'live_scheduled_channel',
        status: LIVE_STREAM_STATUS.SCHEDULED,
      } as any);

      const service = new LiveStreamService(liveStreamRepository, testAgoraConfig);
      await expect(service.getStreamToken(streamId, viewerUserId)).rejects.toMatchObject({
        statusCode: 409,
        code: 'STREAM_NOT_LIVE',
      });
    });

    it('fails safely when Agora credentials are missing', async () => {
      const hostUserId = new mongoose.Types.ObjectId().toString();
      const streamId = new mongoose.Types.ObjectId().toString();
      vi.spyOn(liveStreamRepository, 'findById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: new mongoose.Types.ObjectId(hostUserId),
        channelName: 'live_test_channel',
        status: LIVE_STREAM_STATUS.LIVE,
      } as any);

      const service = new LiveStreamService(liveStreamRepository, {
        appId: undefined,
        appCertificate: undefined,
      });
      await expect(service.getStreamToken(streamId, hostUserId)).rejects.toMatchObject({
        statusCode: 503,
        code: 'AGORA_NOT_CONFIGURED',
      });
    });
  });

  describe('Live Stream Lifecycle', () => {
    it('creates a live stream channel with SCHEDULED status', async () => {
      const hostUserId = new mongoose.Types.ObjectId().toString();
      const streamId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(liveStreamRepository, 'create').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
      } as any);

      vi.spyOn(liveStreamRepository, 'findById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: {
          _id: new mongoose.Types.ObjectId(hostUserId),
          username: 'hostuser',
          displayName: 'Host User',
        },
        title: 'Sunday Worship Service',
        status: LIVE_STREAM_STATUS.SCHEDULED,
        channelName: 'live_test_123',
        viewerCount: 0,
        peakViewerCount: 0,
        likesCount: 0,
        giftsCount: 0,
        createdAt: new Date(),
      } as any);

      const service = new LiveStreamService(liveStreamRepository, testAgoraConfig);
      const stream = await service.createStream(hostUserId, {
        title: 'Sunday Worship Service',
        category: 'Worship',
      });

      expect(stream).toMatchObject({
        id: streamId,
        title: 'Sunday Worship Service',
        status: LIVE_STREAM_STATUS.SCHEDULED,
      });
    });

    it('starts a scheduled live stream channel', async () => {
      const hostUserId = new mongoose.Types.ObjectId().toString();
      const streamId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(liveStreamRepository, 'findById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: new mongoose.Types.ObjectId(hostUserId),
        status: LIVE_STREAM_STATUS.SCHEDULED,
      } as any);

      vi.spyOn(liveStreamRepository, 'updateStatus').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: {
          _id: new mongoose.Types.ObjectId(hostUserId),
          username: 'hostuser',
          displayName: 'Host User',
        },
        title: 'Sunday Worship Service',
        status: LIVE_STREAM_STATUS.LIVE,
        channelName: 'live_test_123',
        startedAt: new Date(),
        createdAt: new Date(),
      } as any);

      const service = new LiveStreamService(liveStreamRepository, testAgoraConfig);
      const stream = await service.startStream(streamId, hostUserId);
      expect(stream.status).toBe(LIVE_STREAM_STATUS.LIVE);
    });

    it('ends an active live stream channel', async () => {
      const hostUserId = new mongoose.Types.ObjectId().toString();
      const streamId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(liveStreamRepository, 'findById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: new mongoose.Types.ObjectId(hostUserId),
        status: LIVE_STREAM_STATUS.LIVE,
      } as any);

      vi.spyOn(liveStreamRepository, 'updateStatus').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(streamId),
        hostId: {
          _id: new mongoose.Types.ObjectId(hostUserId),
          username: 'hostuser',
          displayName: 'Host User',
        },
        title: 'Sunday Worship Service',
        status: LIVE_STREAM_STATUS.ENDED,
        channelName: 'live_test_123',
        endedAt: new Date(),
        createdAt: new Date(),
      } as any);

      const service = new LiveStreamService(liveStreamRepository, testAgoraConfig);
      const stream = await service.endStream(streamId, hostUserId);
      expect(stream.status).toBe(LIVE_STREAM_STATUS.ENDED);
    });
  });
});
