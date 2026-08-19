import agoraToken from 'agora-token';
import { env } from '../../config/env.config.js';
import { AppError } from '../../common/errors/app-error.js';
import { LIVE_STREAM_ROLE, LIVE_STREAM_STATUS } from './live-stream.constants.js';
import { liveStreamRepository, LiveStreamRepository } from './live-stream.repository.js';
import type {
  CreateLiveStreamDTO,
  LiveStreamCommentResponseDTO,
  LiveStreamFeedQueryDTO,
  LiveStreamHostResponseDTO,
  LiveStreamResponseDTO,
  StreamTokenResponseDTO,
} from './live-stream.types.js';
import type { ILiveStream } from './live-stream.model.js';
import type { ILiveStreamComment } from './live-stream-comment.model.js';
import { broadcastLiveStreamStatus } from './live-stream.gateway.js';
import { activityService } from '../activities/activity.service.js';

const { RtcTokenBuilder, RtcRole } = agoraToken;

interface AgoraConfig {
  appId: string | undefined;
  appCertificate: string | undefined;
  tokenTtlSeconds?: number;
}

export class LiveStreamService {
  constructor(
    private readonly repository: LiveStreamRepository = liveStreamRepository,
    private readonly agora: AgoraConfig = {
      appId: env.AGORA_APP_ID,
      appCertificate: env.AGORA_APP_CERTIFICATE,
      tokenTtlSeconds: 3_600,
    },
  ) {}

  async createStream(hostId: string, dto: CreateLiveStreamDTO): Promise<LiveStreamResponseDTO> {
    const channelName = `live_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const streamKey = `sk_${crypto.randomUUID()}`;

    const createPayload: Partial<ILiveStream> = {
      hostId: hostId as any,
      title: dto.title,
      category: dto.category ?? 'General',
      channelName,
      streamKey,
      status: LIVE_STREAM_STATUS.SCHEDULED,
      viewerCount: 0,
      peakViewerCount: 0,
      likesCount: 0,
      giftsCount: 0,
    };

    if (dto.description) {
      createPayload.description = dto.description;
    }
    if (dto.coverImage) {
      createPayload.coverImage = dto.coverImage;
    }

    const stream = await this.repository.create(createPayload);

    const populated = await this.repository.findById(String(stream._id));
    if (!populated) {
      throw new AppError('Failed to initialize live stream.', 500, { code: 'CREATE_STREAM_FAILED' });
    }

    return this.mapToResponse(populated);
  }

  async startStream(streamId: string, hostId: string): Promise<LiveStreamResponseDTO> {
    const stream = await this.repository.findById(streamId);
    if (!stream) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }

    const hostIdStr = (stream.hostId as any)._id?.toString() || stream.hostId.toString();
    if (hostIdStr !== hostId) {
      throw new AppError('Only the stream host can start this live stream.', 403, { code: 'FORBIDDEN' });
    }

    if (stream.status === LIVE_STREAM_STATUS.ENDED) {
      throw new AppError('Cannot start a stream that has already ended.', 400, { code: 'STREAM_ENDED' });
    }

    if (stream.status === LIVE_STREAM_STATUS.LIVE) {
      return this.mapToResponse(stream);
    }

    const updated = await this.repository.updateStatus(streamId, LIVE_STREAM_STATUS.LIVE, {
      startedAt: new Date(),
      activeViewerIds: [],
      viewerCount: 0,
    });

    if (!updated) {
      throw new AppError('Failed to update stream status.', 500, { code: 'UPDATE_FAILED' });
    }
    
    activityService.logActivity({
      userId: hostId,
      actionType: 'live_started',
      entityId: streamId,
      entityModel: 'LiveStream'
    }).catch(console.error);

    const response = this.mapToResponse(updated);
    broadcastLiveStreamStatus(response);
    return response;
  }

  async endStream(streamId: string, hostId: string): Promise<LiveStreamResponseDTO> {
    const stream = await this.repository.findById(streamId);
    if (!stream) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }

    const hostIdStr = (stream.hostId as any)._id?.toString() || stream.hostId.toString();
    if (hostIdStr !== hostId) {
      throw new AppError('Only the stream host can end this live stream.', 403, { code: 'FORBIDDEN' });
    }


    if (stream.status === LIVE_STREAM_STATUS.ENDED) {
      return this.mapToResponse(stream);
    }

    const updated = await this.repository.updateStatus(streamId, LIVE_STREAM_STATUS.ENDED, {
      endedAt: new Date(),
      activeViewerIds: [],
      viewerCount: 0,
    });

    if (!updated) {
      throw new AppError('Failed to end stream.', 500, { code: 'UPDATE_FAILED' });
    }

    const response = this.mapToResponse(updated);
    broadcastLiveStreamStatus(response);
    return response;
  }

  async getStreamToken(streamId: string, userId: string): Promise<StreamTokenResponseDTO> {
    const stream = await this.repository.findById(streamId);
    if (!stream) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }

    const hostIdStr = (stream.hostId as any)._id?.toString() || stream.hostId.toString();
    const isHost = hostIdStr === userId;
    const role = isHost ? LIVE_STREAM_ROLE.HOST : LIVE_STREAM_ROLE.VIEWER;
    const hostUid = stringToNumericUid(hostIdStr);

    if (stream.status === LIVE_STREAM_STATUS.ENDED) {
      throw new AppError('Agora token cannot be issued for an ended stream.', 409, {
        code: 'STREAM_ENDED',
      });
    }
    if (!isHost && stream.status !== LIVE_STREAM_STATUS.LIVE) {
      throw new AppError('This live stream has not started yet.', 409, {
        code: 'STREAM_NOT_LIVE',
      });
    }

    const appId = this.agora.appId;
    const appCertificate = this.agora.appCertificate;
    if (!appId || !appCertificate) {
      throw new AppError('Agora live streaming is not configured.', 503, {
        code: 'AGORA_NOT_CONFIGURED',
      });
    }

    const rtcRole = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expiresInSeconds = this.agora.tokenTtlSeconds ?? 3_600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expiresInSeconds;
    const uid = stringToNumericUid(userId);

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      stream.channelName,
      uid,
      rtcRole,
      privilegeExpiredTs,
      privilegeExpiredTs,
    );

    return {
      appId,
      token,
      channelName: stream.channelName,
      uid,
      hostUid,
      role,
      expiresInSeconds,
    };
  }

  async getFeed(query: LiveStreamFeedQueryDTO): Promise<{
    items: LiveStreamResponseDTO[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));

    const options: {
      tab?: typeof query.tab;
      category?: string;
      page: number;
      limit: number;
    } = { page, limit };

    if (query.tab) options.tab = query.tab;
    if (query.category) options.category = query.category;

    const { streams, total } = await this.repository.findFeedStreams(options);

    return {
      items: streams.map((s) => this.mapToResponse(s)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async searchLiveStreams(query: string, page: number, limit: number) {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
    const { streams, total } = await this.repository.searchStreams(escapedQuery, page, limit);

    return {
      streams: streams.map((s) => this.mapToResponse(s)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStreamById(streamId: string): Promise<LiveStreamResponseDTO> {
    const stream = await this.repository.findById(streamId);
    if (!stream) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }
    return this.mapToResponse(stream);
  }

  async joinStream(streamId: string, userId?: string): Promise<LiveStreamResponseDTO> {
    const stream = await this.requireLiveStream(streamId);
    const hostId = (stream.hostId as any)._id?.toString() || stream.hostId.toString();

    if (!userId || hostId === userId) {
      return this.mapToResponse(stream);
    }

    const updated = await this.repository.addActiveViewer(streamId, userId);
    if (!updated) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }
    const populated = await this.repository.findById(streamId);
    
    if (userId && populated) {
      const hostId = (populated.hostId as any)._id?.toString() || populated.hostId.toString();
      if (hostId !== userId) {
        activityService.logActivity({
          userId: userId,
          actionType: 'live_watched',
          entityId: streamId,
          entityModel: 'LiveStream'
        }).catch(console.error);
      }
    }
    
    return this.mapToResponse(populated!);
  }

  async leaveStream(streamId: string, userId?: string): Promise<LiveStreamResponseDTO> {
    if (!userId) {
      const stream = await this.repository.findById(streamId);
      if (!stream) {
        throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
      }
      return this.mapToResponse(stream);
    }

    const updated = await this.repository.removeActiveViewer(streamId, userId);
    if (!updated) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }
    const populated = await this.repository.findById(streamId);
    return this.mapToResponse(populated!);
  }

  async likeStream(streamId: string): Promise<void> {
    await this.requireLiveStream(streamId);
    await this.repository.incrementLikesCount(streamId);
  }

  async addComment(
    streamId: string,
    userId: string,
    text: string,
  ): Promise<LiveStreamCommentResponseDTO> {
    await this.requireLiveStream(streamId);

    const comment = await this.repository.addComment(streamId, userId, text);
    return this.mapCommentToResponse(comment);
  }

  async getRecentComments(streamId: string): Promise<LiveStreamCommentResponseDTO[]> {
    const comments = await this.repository.getRecentComments(streamId);
    return comments.map((c) => this.mapCommentToResponse(c));
  }

  async addLike(streamId: string): Promise<{ likesCount: number }> {
    await this.requireLiveStream(streamId);
    const updated = await this.repository.incrementLikesCount(streamId);
    if (!updated) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }
    return { likesCount: updated.likesCount };
  }

  async addShare(streamId: string): Promise<{ sharesCount: number }> {
    await this.requireLiveStream(streamId);
    const updated = await this.repository.incrementSharesCount(streamId);
    if (!updated) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }
    return { sharesCount: updated.sharesCount };
  }

  private async requireLiveStream(streamId: string): Promise<ILiveStream> {
    const stream = await this.repository.findById(streamId);
    if (!stream) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }
    if (stream.status !== LIVE_STREAM_STATUS.LIVE) {
      throw new AppError('This live stream is not active.', 409, { code: 'STREAM_NOT_LIVE' });
    }
    return stream;
  }

  private mapToResponse(stream: ILiveStream): LiveStreamResponseDTO {
    const hostDoc = stream.hostId as any;

    const host: LiveStreamHostResponseDTO = {
      id: hostDoc?._id?.toString() || hostDoc?.toString() || '',
      username: hostDoc?.profile?.username || hostDoc?.email?.split('@')[0] || 'user',
      displayName: hostDoc?.profile?.displayName || hostDoc?.profile?.username || hostDoc?.email?.split('@')[0] || 'User',
      isVerified: hostDoc?.isVerified ?? false,
    };
    if (hostDoc?.profile?.photoUrl) {
      host.avatarUrl = hostDoc.profile.photoUrl;
    }

    const response: LiveStreamResponseDTO = {
      id: String(stream._id),
      hostId: host,
      title: stream.title,
      status: stream.status,
      channelName: stream.channelName,
      viewerCount: Math.max(0, stream.viewerCount || 0),
      peakViewerCount: stream.peakViewerCount || 0,
      likesCount: stream.likesCount || 0,
      commentsCount: stream.commentsCount || 0,
      sharesCount: stream.sharesCount || 0,
      giftsCount: stream.giftsCount || 0,
      createdAt: stream.createdAt.toISOString(),
    };

    if (stream.description) response.description = stream.description;
    if (stream.coverImage) response.coverImage = stream.coverImage;
    if (stream.category) response.category = stream.category;
    if (stream.startedAt) response.startedAt = stream.startedAt.toISOString();
    if (stream.endedAt) response.endedAt = stream.endedAt.toISOString();

    return response;
  }

  private mapCommentToResponse(comment: ILiveStreamComment): LiveStreamCommentResponseDTO {
    const userDoc = comment.userId as any;

    const user: LiveStreamHostResponseDTO = {
      id: userDoc?._id?.toString() || userDoc?.toString() || '',
      username: userDoc?.profile?.username || userDoc?.email?.split('@')[0] || 'user',
      displayName: userDoc?.profile?.displayName || userDoc?.profile?.username || userDoc?.email?.split('@')[0] || 'User',
      isVerified: userDoc?.isVerified ?? false,
    };
    if (userDoc?.profile?.photoUrl) {
      user.avatarUrl = userDoc.profile.photoUrl;
    }

    return {
      id: String(comment._id),
      streamId: comment.streamId.toString(),
      user,
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}

export const liveStreamService = new LiveStreamService();

function stringToNumericUid(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}
