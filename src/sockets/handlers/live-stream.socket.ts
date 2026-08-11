import { SOCKET_EVENTS } from '../socket-events.js';
import { liveStreamService } from '../../modules/live-streams/live-stream.service.js';
import { coinService } from '../../modules/coins/coin.service.js';
import { logger } from '../../infrastructure/logger/logger.js';

export function registerLiveStreamSocketHandlers(io: any, socket: any): void {
  socket.on(SOCKET_EVENTS.LIVE_JOIN, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId) return;

      const roomName = `stream:${streamId}`;
      socket.join(roomName);

      const stream = await liveStreamService.joinStream(streamId);

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
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_LEAVE, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId) return;

      const roomName = `stream:${streamId}`;
      socket.leave(roomName);

      const stream = await liveStreamService.leaveStream(streamId);

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
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_COMMENT, async (data: { streamId: string; text: string }) => {
    try {
      const { streamId, text } = data;
      if (!streamId || !text || !socket.user) return;

      const roomName = `stream:${streamId}`;
      const comment = await liveStreamService.addComment(streamId, socket.user.id, text);

      io.to(roomName).emit(SOCKET_EVENTS.NEW_COMMENT, comment);
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_COMMENT socket handler');
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_LIKE, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId) return;

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
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_GIFT, async (data: { streamId: string; giftId: string; quantity?: number }) => {
    try {
      const { streamId, giftId, quantity = 1 } = data;
      if (!streamId || !giftId || !socket.user) return;

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
      socket.emit('live:error', {
        message: error instanceof Error ? error.message : 'Failed to send gift',
      });
    }
  });

  socket.on(SOCKET_EVENTS.LIVE_SHARE, async (data: { streamId: string }) => {
    try {
      const { streamId } = data;
      if (!streamId) return;

      const roomName = `stream:${streamId}`;
      const result = await liveStreamService.addShare(streamId);

      io.to(roomName).emit(SOCKET_EVENTS.NEW_SHARE, {
        streamId,
        sharesCount: result.sharesCount,
        userId: socket.user?.id,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in LIVE_SHARE socket handler');
    }
  });
}
