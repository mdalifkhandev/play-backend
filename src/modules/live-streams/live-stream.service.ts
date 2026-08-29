import agoraToken from 'agora-token';
import { env } from '../../config/env.config.js';
import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { LIVE_STREAM_ROLE, LIVE_STREAM_STATUS, type LiveStreamStatus } from './live-stream.constants.js';
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
import { adminNotificationService } from '../notifications/admin-notification.service.js';
import { isRecordingActive, liveStreamRecordingService } from './live-stream-recording.service.js';
import { ModerationReportModel } from '../moderation/moderation-report.model.js';
import type { AdminLiveStreamsQuery } from './live-stream.validation.js';
import { cloudinaryStorage } from '../../infrastructure/storage/index.js';

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
    const activeStream = await this.repository.findActiveByHostId(hostId);
    if (activeStream) {
      logger.info(
        { hostId, streamId: String(activeStream._id), status: activeStream.status },
        'Reusing active live stream for host',
      );
      return this.mapToResponse(activeStream);
    }

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
      await this.endOtherActiveStreamsForHost(hostId, streamId);
      return this.mapToResponse(stream);
    }

    await this.endOtherActiveStreamsForHost(hostId, streamId);

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
    this.startRecordingInBackground(String(updated._id), updated.channelName).catch((error) => {
      logger.error({ err: error, streamId }, 'Unexpected live recording start background error');
    });
    return response;
  }

  private async endOtherActiveStreamsForHost(hostId: string, currentStreamId: string): Promise<void> {
    const otherStreams = await this.repository.findActiveStreamsByHostId(hostId, currentStreamId);
    if (otherStreams.length === 0) return;

    await Promise.all(
      otherStreams.map(async (otherStream) => {
        const otherStreamId = String(otherStream._id);

        if (otherStream.recording && isRecordingActive(otherStream.recording)) {
          const recording = { ...otherStream.recording, status: 'stopping' as const };
          await this.repository.updateRecordingState(otherStreamId, recording);
          this.stopRecordingInBackground(otherStreamId, otherStream.channelName, otherStream.recording).catch((error) => {
            logger.error({ err: error, streamId: otherStreamId }, 'Unexpected duplicate live recording stop error');
          });
        }

        const ended = await this.repository.updateStatus(otherStreamId, LIVE_STREAM_STATUS.ENDED, {
          endedAt: new Date(),
          activeViewerIds: [],
          viewerCount: 0,
        });

        if (ended) {
          const response = this.mapToResponse(ended);
          broadcastLiveStreamStatus(response);
        }
      }),
    );
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

    const activeRecording = stream.recording;
    if (activeRecording && isRecordingActive(activeRecording)) {
      const recording = { ...activeRecording, status: 'stopping' as const };
      await this.repository.updateRecordingState(streamId, recording);
      this.stopRecordingInBackground(streamId, stream.channelName, activeRecording).catch((error) => {
        logger.error({ err: error, streamId }, 'Unexpected live recording stop background error');
      });
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

  async listForAdmin(query: AdminLiveStreamsQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    if (query.reported) {
      const [reports, total] = await Promise.all([
        ModerationReportModel.find({ targetType: 'live_stream', status: 'pending' })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('reporterId', 'email profile.username profile.displayName profile.photoUrl')
          .lean()
          .exec(),
        ModerationReportModel.countDocuments({ targetType: 'live_stream', status: 'pending' }),
      ]);

      const streamIds = reports.map((report) => report.targetId);
      const streams = await this.repository.findByIds(streamIds.map((id) => id.toString()));
      const streamsById = new Map(streams.map((stream) => [String(stream._id), stream]));

      return {
        items: reports.map((report: any) => {
          const stream = streamsById.get(report.targetId.toString());
          return {
            reportId: report._id.toString(),
            reason: report.reason,
            reportedAt: report.createdAt.toISOString(),
            reporter: mapAdminUser(report.reporterId),
            stream: stream ? this.mapAdminStream(stream) : undefined,
          };
        }),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    }

    const { streams, total } = await this.repository.findForAdmin({
      page,
      limit,
      ...(query.status ? { status: query.status as LiveStreamStatus } : {}),
    });

    return {
      items: streams.map((stream) => this.mapAdminStream(stream)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async listRecordedForAdmin(query: Pick<AdminLiveStreamsQuery, 'page' | 'limit'>) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const { streams, total } = await this.repository.findRecordedForAdmin({ page, limit });

    for (const stream of streams) {
      if (
        stream.recording?.status === 'stopped' &&
        stream.recording.fileList &&
        !stream.recording.cloudinaryUrl
      ) {
        this.uploadRecordingToCloudinary(String(stream._id), stream.recording).catch((error) => {
          logger.error({ err: error, streamId: String(stream._id) }, 'Recorded live Cloudinary retry failed');
        });
      }
    }

    return {
      items: streams.map((stream) => this.mapAdminStream(stream)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async forceEndForAdmin(streamId: string): Promise<LiveStreamResponseDTO> {
    const stream = await this.repository.findById(streamId);
    if (!stream) {
      throw new AppError('Live stream not found.', 404, { code: 'STREAM_NOT_FOUND' });
    }

    if (stream.status === LIVE_STREAM_STATUS.ENDED) {
      return this.mapToResponse(stream);
    }

    const activeRecording = stream.recording;
    if (activeRecording && isRecordingActive(activeRecording)) {
      const recording = { ...activeRecording, status: 'stopping' as const };
      await this.repository.updateRecordingState(streamId, recording);
      this.stopRecordingInBackground(streamId, stream.channelName, activeRecording).catch((error) => {
        logger.error({ err: error, streamId }, 'Unexpected admin live recording stop background error');
      });
    }

    const updated = await this.repository.updateStatus(streamId, LIVE_STREAM_STATUS.ENDED, {
      endedAt: new Date(),
      activeViewerIds: [],
      viewerCount: 0,
    });
    if (!updated) {
      throw new AppError('Failed to end stream.', 500, { code: 'UPDATE_FAILED' });
    }

    void adminNotificationService.notifyAdmins({
      event: 'live_force_ended',
      title: 'Live stream force ended',
      body: `Admin ended live stream ${streamId}.`,
      relatedEntityId: streamId,
    });

    const response = this.mapToResponse(updated);
    broadcastLiveStreamStatus(response);
    return response;
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

  private async startRecordingInBackground(streamId: string, channelName: string): Promise<void> {
    if (!liveStreamRecordingService.isEnabled()) {
      await this.repository.updateRecordingState(streamId, {
        status: 'disabled',
        mode: env.AGORA_RECORDING_MODE,
        errorMessage: 'Agora cloud recording is disabled. Set AGORA_CLOUD_RECORDING_ENABLED=true and configure Agora recording storage to save live videos.',
      });
      return;
    }

    await this.repository.updateRecordingState(streamId, {
      status: 'starting',
      mode: env.AGORA_RECORDING_MODE,
    });

    try {
      const recording = await liveStreamRecordingService.start({ streamId, channelName });
      if (recording) {
        await this.repository.updateRecordingState(streamId, recording);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, streamId }, 'Agora cloud recording start failed');
      await this.repository.updateRecordingState(streamId, {
        status: 'failed',
        mode: env.AGORA_RECORDING_MODE,
        errorMessage: message,
      });
      void adminNotificationService.notifyAdmins({
        event: 'live_recording_failed',
        title: 'Live recording failed',
        body: `Recording could not start for live stream ${streamId}: ${message}`,
        relatedEntityId: streamId,
      });
    }
  }

  private async stopRecordingInBackground(
    streamId: string,
    channelName: string,
    recording: NonNullable<ILiveStream['recording']>,
  ): Promise<void> {
    try {
      const stoppedRecording = await liveStreamRecordingService.stop({ streamId, channelName, recording });
      if (stoppedRecording) {
        await this.repository.updateRecordingState(streamId, stoppedRecording);
        await this.uploadRecordingToCloudinary(streamId, stoppedRecording);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, streamId }, 'Agora cloud recording stop failed');
      await this.repository.updateRecordingState(streamId, {
        ...recording,
        status: 'failed',
        stoppedAt: new Date(),
        errorMessage: message,
      });
      void adminNotificationService.notifyAdmins({
        event: 'live_recording_failed',
        title: 'Live recording failed',
        body: `Recording could not stop for live stream ${streamId}: ${message}`,
        relatedEntityId: streamId,
      });
    }
  }

  private async uploadRecordingToCloudinary(
    streamId: string,
    recording: NonNullable<ILiveStream['recording']>,
  ): Promise<void> {
    if (!recording.fileList) return;

    const [sourceUrl] = extractRecordingPlaybackUrls(recording.fileList);
    if (!sourceUrl) {
      logger.warn({ streamId }, 'Live recording stopped but no public recording URL was found for Cloudinary upload');
      return;
    }

    try {
      const uploaded = await cloudinaryStorage.upload(sourceUrl, {
        folder: 'jesusname7/live-recordings',
        publicId: streamId,
        resourceType: 'video',
        overwrite: true,
        tags: ['live-recording', streamId],
      });

      await this.repository.updateRecordingState(streamId, {
        ...recording,
        cloudinaryUrl: uploaded.secureUrl,
        cloudinaryPublicId: uploaded.publicId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, streamId, sourceUrl }, 'Cloudinary live recording upload failed');
      await this.repository.updateRecordingState(streamId, {
        ...recording,
        errorMessage: `Cloudinary upload failed: ${message}`,
      });
      void adminNotificationService.notifyAdmins({
        event: 'live_recording_failed',
        title: 'Live recording upload failed',
        body: `Recording could not upload to Cloudinary for live stream ${streamId}: ${message}`,
        relatedEntityId: streamId,
      });
    }
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
    if (stream.recording) {
      response.recording = {
        status: stream.recording.status,
      };
      if (stream.recording.mode) response.recording.mode = stream.recording.mode;
      if (stream.recording.startedAt) response.recording.startedAt = stream.recording.startedAt.toISOString();
      if (stream.recording.stoppedAt) response.recording.stoppedAt = stream.recording.stoppedAt.toISOString();
      if (stream.recording.cloudinaryUrl) response.recording.cloudinaryUrl = stream.recording.cloudinaryUrl;
      if (stream.recording.cloudinaryPublicId) response.recording.cloudinaryPublicId = stream.recording.cloudinaryPublicId;
      if (stream.recording.fileList) {
        response.recording.fileList = stream.recording.fileList;
        const playbackUrls = extractRecordingPlaybackUrls(stream.recording.fileList);
        if (stream.recording.cloudinaryUrl) playbackUrls.unshift(stream.recording.cloudinaryUrl);
        if (playbackUrls.length > 0) response.recording.playbackUrls = playbackUrls;
      } else if (stream.recording.cloudinaryUrl) {
        response.recording.playbackUrls = [stream.recording.cloudinaryUrl];
      }
      if (stream.recording.errorMessage) response.recording.errorMessage = stream.recording.errorMessage;
    }

    return response;
  }

  private mapAdminStream(stream: ILiveStream) {
    const response = this.mapToResponse(stream);
    return {
      ...response,
      durationSeconds: getDurationSeconds(stream.startedAt, stream.endedAt),
    };
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

function mapAdminUser(user: any) {
  if (!user) return undefined;
  return {
    id: user._id?.toString(),
    email: user.email,
    displayName: user.profile?.displayName || user.profile?.username || user.email,
    username: user.profile?.username,
    photoUrl: user.profile?.photoUrl,
  };
}

function getDurationSeconds(startedAt?: Date, endedAt?: Date) {
  if (!startedAt) return 0;
  const end = endedAt?.getTime() ?? Date.now();
  return Math.max(0, Math.floor((end - startedAt.getTime()) / 1000));
}

function extractRecordingPlaybackUrls(fileList: unknown): string[] {
  const urls = new Set<string>();
  const queue: unknown[] = [fileList];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === 'string') {
      addRecordingUrl(urls, current);
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      for (const key of ['url', 'fileUrl', 'fileURL', 'downloadUrl', 'playUrl', 'location', 'fileName']) {
        const value = record[key];
        if (typeof value === 'string') addRecordingUrl(urls, value);
      }
      queue.push(...Object.values(record));
    }
  }

  return [...urls].sort((left, right) => recordingUrlRank(left) - recordingUrlRank(right));
}

function addRecordingUrl(urls: Set<string>, value: string): void {
  if (!isRecordingVideoPath(value)) return;
  if (/^https?:\/\//i.test(value)) {
    urls.add(value);
    return;
  }

  if (!env.AGORA_RECORDING_PUBLIC_BASE_URL) return;
  const baseUrl = env.AGORA_RECORDING_PUBLIC_BASE_URL.replace(/\/+$/, '');
  const path = value.replace(/^\/+/, '');
  urls.add(`${baseUrl}/${path}`);
}

function isRecordingVideoPath(value: string): boolean {
  return /\.(mp4|m3u8|mov|webm)(\?|$)/i.test(value);
}

function recordingUrlRank(value: string): number {
  if (/\.mp4(\?|$)/i.test(value)) return 0;
  if (/\.m3u8(\?|$)/i.test(value)) return 1;
  return 2;
}

function stringToNumericUid(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}
