import { SOCKET_EVENTS } from '../socket-events.js';
import { conversationService } from '../../modules/conversations/conversation.service.js';
import { logger } from '../../infrastructure/logger/logger.js';

export function registerChatSocketHandlers(io: any, socket: any): void {
  socket.on(SOCKET_EVENTS.CHAT_JOIN, (data: { conversationId: string }) => {
    try {
      const { conversationId } = data;
      if (!conversationId) return;

      const roomName = `chat:${conversationId}`;
      socket.join(roomName);
    } catch (error) {
      logger.error({ err: error }, 'Error in CHAT_JOIN socket handler');
    }
  });

  socket.on(SOCKET_EVENTS.CHAT_LEAVE, (data: { conversationId: string }) => {
    try {
      const { conversationId } = data;
      if (!conversationId) return;

      const roomName = `chat:${conversationId}`;
      socket.leave(roomName);
    } catch (error) {
      logger.error({ err: error }, 'Error in CHAT_LEAVE socket handler');
    }
  });

  socket.on(
    SOCKET_EVENTS.CHAT_SEND_MESSAGE,
    async (data: { conversationId: string; text?: string; mediaUrl?: string }) => {
      try {
        const { conversationId, text, mediaUrl } = data;
        if (!conversationId || (!text && !mediaUrl) || !socket.user) return;

        const roomName = `chat:${conversationId}`;
        const message = await conversationService.sendMessage(conversationId, socket.user.userId, {
          text,
          mediaUrl,
        });

        io.to(roomName).emit(SOCKET_EVENTS.CHAT_NEW_MESSAGE, message);
      } catch (error) {
        logger.error({ err: error }, 'Error in CHAT_SEND_MESSAGE socket handler');
      }
    },
  );

  socket.on(
    SOCKET_EVENTS.CHAT_TYPING,
    (data: { conversationId: string; isTyping: boolean }) => {
      try {
        const { conversationId, isTyping } = data;
        if (!conversationId || !socket.user) return;

        const roomName = `chat:${conversationId}`;
        socket.to(roomName).emit(SOCKET_EVENTS.USER_TYPING, {
          conversationId,
          userId: socket.user.userId,
          isTyping: isTyping ?? true,
        });
      } catch (error) {
        logger.error({ err: error }, 'Error in CHAT_TYPING socket handler');
      }
    },
  );

  socket.on(
    SOCKET_EVENTS.CHAT_TYPING_START,
    (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId || !socket.user) return;

        const roomName = `chat:${conversationId}`;
        socket.to(roomName).emit(SOCKET_EVENTS.USER_TYPING, {
          conversationId,
          userId: socket.user.userId,
          isTyping: true,
        });
      } catch (error) {
        logger.error({ err: error }, 'Error in CHAT_TYPING_START socket handler');
      }
    },
  );

  socket.on(
    SOCKET_EVENTS.CHAT_TYPING_STOP,
    (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId || !socket.user) return;

        const roomName = `chat:${conversationId}`;
        socket.to(roomName).emit(SOCKET_EVENTS.USER_TYPING, {
          conversationId,
          userId: socket.user.userId,
          isTyping: false,
        });
      } catch (error) {
        logger.error({ err: error }, 'Error in CHAT_TYPING_STOP socket handler');
      }
    },
  );
}
