import type { Server } from 'socket.io';

import { AppError } from '../../common/errors/app-error.js';
import {
  ConversationService,
  conversationService,
} from '../../modules/conversations/conversation.service.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { SOCKET_EVENTS } from '../socket-events.js';
import { getConversationRoom, getUserRoom } from '../socket-rooms.js';
import type {
  AuthenticatedSocket,
  SocketAck,
  SocketErrorPayload,
} from '../socket.types.js';

interface ConversationPayload {
  conversationId: string;
}

interface SendMessagePayload extends ConversationPayload {
  text?: string;
  mediaUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
}

interface TypingPayload extends ConversationPayload {
  isTyping?: boolean;
}

interface BlockUserPayload {
  conversationId?: string;
  targetUserId: string;
}

export function registerChatSocketHandlers(
  io: Server,
  socket: AuthenticatedSocket,
  service: ConversationService = conversationService,
): void {
  socket.on(
    SOCKET_EVENTS.CHAT_JOIN,
    async (data: ConversationPayload, ack?: SocketAck): Promise<void> => {
      await handleSocketAction(socket, SOCKET_EVENTS.CHAT_JOIN, ack, async () => {
        const conversationId = requireConversationId(data);
        const result = await service.joinConversation(conversationId, socket.user.userId);
        const roomName = getConversationRoom(conversationId);
        await socket.join(roomName);

        const joined = { conversationId };
        socket.emit(SOCKET_EVENTS.CHAT_JOINED, joined);

        if (result.messageIds.length > 0) {
          emitToParticipants(io, result.participantIds, SOCKET_EVENTS.CHAT_MESSAGE_DELIVERED, {
            conversationId,
            messageIds: result.messageIds,
            deliveredAt: result.deliveredAt,
            deliveredBy: socket.user.userId,
          });
        }

        return joined;
      });
    },
  );

  socket.on(
    SOCKET_EVENTS.CHAT_LEAVE,
    async (data: ConversationPayload, ack?: SocketAck): Promise<void> => {
      await handleSocketAction(socket, SOCKET_EVENTS.CHAT_LEAVE, ack, async () => {
        const conversationId = requireConversationId(data);
        await socket.leave(getConversationRoom(conversationId));
        return { conversationId };
      });
    },
  );

  socket.on(
    SOCKET_EVENTS.CHAT_SEND_MESSAGE,
    async (data: SendMessagePayload, ack?: SocketAck): Promise<void> => {
      await handleSocketAction(socket, SOCKET_EVENTS.CHAT_SEND_MESSAGE, ack, async () => {
        const conversationId = requireConversationId(data);
        const dto = normalizeMessage(data);
        const message = await service.sendMessage(conversationId, socket.user.userId, dto);
        const participantState = await service.joinConversation(conversationId, socket.user.userId);

        let target = io.to(getConversationRoom(conversationId));
        for (const participantId of participantState.participantIds) {
          target = target.to(getUserRoom(participantId));
        }
        target.emit(SOCKET_EVENTS.CHAT_NEW_MESSAGE, message);

        for (const participantId of participantState.participantIds) {
          if (participantId === socket.user.userId) continue;
          const onlineSockets = await io.in(getUserRoom(participantId)).fetchSockets();
          if (onlineSockets.length === 0) continue;

          const delivery = await service.joinConversation(conversationId, participantId);
          if (delivery.messageIds.length > 0) {
            emitToParticipants(io, delivery.participantIds, SOCKET_EVENTS.CHAT_MESSAGE_DELIVERED, {
              conversationId,
              messageIds: delivery.messageIds,
              deliveredAt: delivery.deliveredAt,
              deliveredBy: participantId,
            });
          }
        }

        return message;
      });
    },
  );

  const emitTyping = async (
    data: TypingPayload,
    isTyping: boolean,
    ack?: SocketAck,
  ): Promise<void> => {
    await handleSocketAction(socket, SOCKET_EVENTS.CHAT_TYPING, ack, async () => {
      const conversationId = requireConversationId(data);
      const roomName = getConversationRoom(conversationId);
      if (!socket.rooms.has(roomName)) {
        throw new AppError('Join the conversation before sending typing events.', 403, {
          code: 'CHAT_ROOM_NOT_JOINED',
        });
      }

      const payload = {
        conversationId,
        userId: socket.user.userId,
        isTyping,
      };
      socket.to(roomName).emit(SOCKET_EVENTS.USER_TYPING, payload);
      return payload;
    });
  };

  socket.on(SOCKET_EVENTS.CHAT_TYPING, (data: TypingPayload, ack?: SocketAck) =>
    emitTyping(data, data?.isTyping ?? true, ack),
  );
  socket.on(SOCKET_EVENTS.CHAT_TYPING_START, (data: TypingPayload, ack?: SocketAck) =>
    emitTyping(data, true, ack),
  );
  socket.on(SOCKET_EVENTS.CHAT_TYPING_STOP, (data: TypingPayload, ack?: SocketAck) =>
    emitTyping(data, false, ack),
  );

  socket.on(
    SOCKET_EVENTS.CHAT_READ,
    async (data: ConversationPayload, ack?: SocketAck): Promise<void> => {
      await handleSocketAction(socket, SOCKET_EVENTS.CHAT_READ, ack, async () => {
        const conversationId = requireConversationId(data);
        const result = await service.markConversationRead(conversationId, socket.user.userId);
        const receipt = {
          conversationId,
          messageIds: result.messageIds,
          readAt: result.readAt,
          readBy: socket.user.userId,
        };
        emitToParticipants(io, result.participantIds, SOCKET_EVENTS.CHAT_READ_RECEIPT, receipt);
        return receipt;
      });
    },
  );

  socket.on(
    SOCKET_EVENTS.CHAT_BLOCK_USER,
    async (data: BlockUserPayload, ack?: SocketAck): Promise<void> => {
      await handleSocketAction(socket, SOCKET_EVENTS.CHAT_BLOCK_USER, ack, async () => {
        const targetUserId = requireTargetUserId(data);
        await service.blockUser(socket.user.userId, targetUserId);
        return emitBlockStatuses(io, service, socket.user.userId, targetUserId, data.conversationId);
      });
    },
  );

  socket.on(
    SOCKET_EVENTS.CHAT_UNBLOCK_USER,
    async (data: BlockUserPayload, ack?: SocketAck): Promise<void> => {
      await handleSocketAction(socket, SOCKET_EVENTS.CHAT_UNBLOCK_USER, ack, async () => {
        const targetUserId = requireTargetUserId(data);
        await service.unblockUser(socket.user.userId, targetUserId);
        return emitBlockStatuses(io, service, socket.user.userId, targetUserId, data.conversationId);
      });
    },
  );
}

async function handleSocketAction<T>(
  socket: AuthenticatedSocket,
  event: string,
  ack: SocketAck<T> | undefined,
  action: () => Promise<T>,
): Promise<void> {
  try {
    const data = await action();
    ack?.({ success: true, data });
  } catch (error) {
    const payload = toSocketError(event, error);
    logger.warn({ err: error, event, userId: socket.user.userId }, 'Chat socket action failed');
    socket.emit(SOCKET_EVENTS.CHAT_ERROR, payload);
    ack?.({ success: false, error: payload });
  }
}

function requireConversationId(data: ConversationPayload | undefined): string {
  const conversationId = data?.conversationId?.trim();
  if (!conversationId) {
    throw new AppError('conversationId is required.', 400, { code: 'VALIDATION_ERROR' });
  }
  return conversationId;
}

function requireTargetUserId(data: BlockUserPayload | undefined): string {
  const targetUserId = data?.targetUserId?.trim();
  if (!targetUserId) {
    throw new AppError('targetUserId is required.', 400, { code: 'VALIDATION_ERROR' });
  }
  return targetUserId;
}

async function emitBlockStatuses(
  io: Server,
  service: ConversationService,
  actorUserId: string,
  targetUserId: string,
  conversationId?: string,
) {
  const [actorStatus, targetStatus] = await Promise.all([
    service.getBlockStatus(actorUserId, targetUserId),
    service.getBlockStatus(targetUserId, actorUserId),
  ]);
  const actorPayload = {
    userId: targetUserId,
    ...(conversationId ? { conversationId } : {}),
    ...actorStatus,
  };
  const targetPayload = {
    userId: actorUserId,
    ...(conversationId ? { conversationId } : {}),
    ...targetStatus,
  };

  io.to(getUserRoom(actorUserId)).emit(SOCKET_EVENTS.CHAT_BLOCK_STATUS_CHANGED, actorPayload);
  io.to(getUserRoom(targetUserId)).emit(SOCKET_EVENTS.CHAT_BLOCK_STATUS_CHANGED, targetPayload);

  return actorPayload;
}

function normalizeMessage(data: SendMessagePayload): {
  text?: string;
  mediaUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
} {
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const mediaUrl = typeof data?.mediaUrl === 'string' ? data.mediaUrl.trim() : '';
  const attachmentType = data?.attachmentType;
  if (!text && !mediaUrl) {
    throw new AppError('Message text or media is required.', 400, { code: 'EMPTY_MESSAGE' });
  }
  if (
    attachmentType &&
    !['image', 'video', 'audio', 'file'].includes(attachmentType)
  ) {
    throw new AppError('Invalid attachment type.', 400, { code: 'VALIDATION_ERROR' });
  }
  if (text.length > 2_000) {
    throw new AppError('Message text cannot exceed 2000 characters.', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  return {
    ...(text ? { text } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(attachmentType ? { attachmentType } : {}),
  };
}

function emitToParticipants(
  io: Server,
  participantIds: string[],
  event: string,
  payload: unknown,
): void {
  let target = io.to([]);
  for (const participantId of participantIds) {
    target = target.to(getUserRoom(participantId));
  }
  target.emit(event, payload);
}

function toSocketError(event: string, error: unknown): SocketErrorPayload {
  if (error instanceof AppError) {
    return { event, code: error.code, message: error.message };
  }
  return {
    event,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unable to process the chat event.',
  };
}
