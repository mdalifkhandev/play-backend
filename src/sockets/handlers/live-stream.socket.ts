import { SOCKET_EVENTS } from '../socket-events.js';
import { liveStreamService } from '../../modules/live-streams/live-stream.service.js';
import { coinService } from '../../modules/coins/coin.service.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { AppError } from '../../common/errors/app-error.js';
import { kidsModeService } from '../../modules/kids-mode/kids-mode.service.js';

export function registerLiveStreamSocketHandlers(io: any, socket: any): void {
  const joinedStreamIds = new Set<string>();

  socket.on(SOCKET_EVENTS.LIVE_JOIN, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId) return;
      await assertLiveStreamingAllowed(socket.user?.id);
      if (joinedStreamIds.has(streamId)) return;

      const roomName = `stream:${streamId}`;
      const stream = await liveStreamService.joinStream(streamId);
      await socket.join(roomName);
      joinedStreamIds.add(streamId);

      io.to(roomName).emit(SOCKET_EVENTS.VIEWER_COUNT_UPDATE, {
        streamId,
        viewerCount: stream.viewerCount,
        peakViewerCount: stream.peakViewerCount,
      });

      if (socket.user) {
        socket.to(roomName).emit(SOCKET_EVENTS.USER_JOINED, {
          streamId,
          user: {
            id: socket.user.id,
            username: socket.user.username,
            displayName: socket.user.displayName,
            avatarUrl: socket.user.avatarUrl,
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_JOIN socket handler');
      emitLiveError(socket, error);
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_LEAVE, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId || !joinedStreamIds.has(streamId)) return;

      const roomName = `stream:${streamId}`;
      const stream = await liveStreamService.leaveStream(streamId);
      await socket.leave(roomName);
      joinedStreamIds.delete(streamId);

      io.to(roomName).emit(SOCKET_EVENTS.VIEWER_COUNT_UPDATE, {
        streamId,
        viewerCount: stream.viewerCount,
        peakViewerCount: stream.peakViewerCount,
      });

      if (socket.user) {
        socket.to(roomName).emit(SOCKET_EVENTS.USER_LEFT, {
          streamId,
          userId: socket.user.id,
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_LEAVE socket handler');
      emitLiveError(socket, error);
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_COMMENT, async (data: { streamId: string; text: string }) => {
    try {
      const { streamId, text } = data;
      if (!streamId || !text || !socket.user) return;
      await assertLiveStreamingAllowed(socket.user.id);

      const roomName = `stream:${streamId}`;
      const comment = await liveStreamService.addComment(streamId, socket.user.id, text);

      io.to(roomName).emit(SOCKET_EVENTS.NEW_COMMENT, comment);
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_COMMENT socket handler');
      emitLiveError(socket, error);
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_LIKE, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId) return;
      await assertLiveStreamingAllowed(socket.user?.id);

      const roomName = `stream:${streamId}`;
      const result = await liveStreamService.addLike(streamId);

      io.to(roomName).emit(SOCKET_EVENTS.NEW_REACTION, {
        streamId,
        type: 'HEART',
        likesCount: result.likesCount,
        userId: socket.user?.id,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_LIKE socket handler');
      emitLiveError(socket, error);
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_GIFT, async (data: { streamId: string; giftId: string; quantity?: number }) => {
    try {
      const { streamId, giftId, quantity = 1 } = data;
      if (!streamId || !giftId || !socket.user) return;
      await assertLiveStreamingAllowed(socket.user.id);

      const roomName = `stream:${streamId}`;

      const result = await coinService.sendGift(socket.user.id, {
        targetType: 'live-stream',
        targetId: streamId,
        giftId,
        quantity,
      });

      io.to(roomName).emit(SOCKET_EVENTS.NEW_GIFT, {
        streamId,
        sender: {
          id: socket.user.id,
          username: socket.user.username,
          displayName: socket.user.displayName,
          avatarUrl: socket.user.avatarUrl,
        },
        gift: result.gift,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_GIFT socket handler');
      emitLiveError(socket, error);
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_SHARE, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId) return;
      await assertLiveStreamingAllowed(socket.user?.id);

      const roomName = `stream:${streamId}`;
      const result = await liveStreamService.addShare(streamId);

      io.to(roomName).emit(SOCKET_EVENTS.NEW_SHARE, {
        streamId,
        sharesCount: result.sharesCount,
        userId: socket.user?.id,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_SHARE socket handler');
      emitLiveError(socket, error);
    }
  });

  socket.on('disconnect', () => {
    for (const streamId of joinedStreamIds) {
      void liveStreamService.leaveStream(streamId).catch((error) => {
        logger.warn({ err: error, streamId }, 'Failed to clean up disconnected live viewer');
      });
    }
    joinedStreamIds.clear();
  });
}

async function assertLiveStreamingAllowed(userId?: string): Promise<void> {
  if (!userId) return;
  const status = await kidsModeService.getStatus(userId);
  if (status.isActive) {
    throw new AppError('Live streaming is disabled while Kids Mode is active.', 403, {
      code: 'KIDS_FEATURE_DISABLED',
    });
  }
}

function emitLiveError(socket: any, error: unknown): void {
  socket.emit('live:error', {
    code: error instanceof AppError ? error.code : 'LIVE_ACTION_FAILED',
    message: error instanceof Error ? error.message : 'Live action failed.',
  });
}
