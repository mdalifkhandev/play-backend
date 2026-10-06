import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeSocketServer } from '../src/sockets/socket.server.js';
import { SOCKET_EVENTS } from '../src/sockets/socket-events.js';

describe('Socket.IO direct chat integration', () => {
  const sockets: ClientSocket[] = [];

  afterEach(() => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
  });

  it('authenticates, joins, sends, types, delivers, and marks messages read', async () => {
    const userAId = '640000000000000000000001';
    const userBId = '640000000000000000000002';
    const conversationId = '640000000000000000000099';
    let messageCounter = 0;
    let pendingDelivery: string[] = [];

    const chatService = {
      joinConversation: async (_conversationId: string, userId: string) => {
        const messageIds = userId === userBId ? [...pendingDelivery] : [];
        if (userId === userBId) pendingDelivery = [];
        return {
          participantIds: [userAId, userBId],
          messageIds,
          deliveredAt: new Date().toISOString(),
        };
      },
      sendMessage: async (_conversationId: string, senderId: string, dto: any) => {
        messageCounter += 1;
        const id = `message-${messageCounter}`;
        pendingDelivery.push(id);
        return {
          id,
          conversationId,
          sender: { id: senderId, username: 'sender', displayName: 'Sender' },
          text: dto.text,
          isRead: false,
          createdAt: new Date().toISOString(),
        };
      },
      markConversationRead: async () => ({
        participantIds: [userAId, userBId],
        messageIds: ['message-1'],
        readAt: new Date().toISOString(),
      }),
    };

    const httpServer = createServer();
    const io = initializeSocketServer(httpServer, {
      registerLiveHandlers: false,
      chatService: chatService as any,
      authMiddleware: (socket, next) => {
        const token = socket.handshake.auth['token'];
        if (token !== 'user-a' && token !== 'user-b') {
          const error = new Error('Access token is required.') as Error & {
            data?: { code: string };
          };
          error.data = { code: 'ACCESS_TOKEN_REQUIRED' };
          next(error);
          return;
        }
        const userId = token === 'user-a' ? userAId : userBId;
        (socket as any).user = {
          id: userId,
          userId,
          email: `${token}@example.com`,
          role: 'user',
          sessionId: `session-${token}`,
        };
        next();
      },
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;

    const userA = connectClient(url, 'user-a', sockets);
    const userB = connectClient(url, 'user-b', sockets);
    await Promise.all([waitForEvent(userA, 'connect'), waitForEvent(userB, 'connect')]);

    const rejected = connectClient(url, '', sockets);
    const connectionError = await waitForEvent<any>(rejected, 'connect_error');
    expect(connectionError.data.code).toBe('ACCESS_TOKEN_REQUIRED');

    await Promise.all([
      emitWithAck(userA, SOCKET_EVENTS.CHAT_JOIN, { conversationId }),
      emitWithAck(userB, SOCKET_EVENTS.CHAT_JOIN, { conversationId }),
    ]);

    const newMessagePromise = waitForEvent<any>(userB, SOCKET_EVENTS.CHAT_NEW_MESSAGE);
    const deliveredPromise = waitForEvent<any>(userA, SOCKET_EVENTS.CHAT_MESSAGE_DELIVERED);
    const sendAck = await emitWithAck<any>(userA, SOCKET_EVENTS.CHAT_SEND_MESSAGE, {
      conversationId,
      text: 'Hello from user A',
    });
    const [newMessage, delivered] = await Promise.all([newMessagePromise, deliveredPromise]);

    expect(sendAck.success).toBe(true);
    expect(newMessage.text).toBe('Hello from user A');
    expect(delivered.messageIds).toEqual(['message-1']);
    expect(delivered.deliveredBy).toBe(userBId);

    const typingPromise = waitForEvent<any>(userB, SOCKET_EVENTS.USER_TYPING);
    await emitWithAck(userA, SOCKET_EVENTS.CHAT_TYPING_START, { conversationId });
    expect(await typingPromise).toMatchObject({ userId: userAId, isTyping: true });

    const readPromise = waitForEvent<any>(userA, SOCKET_EVENTS.CHAT_READ_RECEIPT);
    const readAck = await emitWithAck<any>(userB, SOCKET_EVENTS.CHAT_READ, { conversationId });
    const readReceipt = await readPromise;
    expect(readAck.success).toBe(true);
    expect(readReceipt).toMatchObject({
      conversationId,
      messageIds: ['message-1'],
      readBy: userBId,
    });

    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
});

function connectClient(url: string, token: string, sockets: ClientSocket[]): ClientSocket {
  const socket = createClient(url, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 3_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitWithAck<T = unknown>(
  socket: ClientSocket,
  event: string,
  payload: unknown,
): Promise<{ success: boolean; data?: T; error?: unknown }> {
  return new Promise((resolve, reject) => {
    socket.timeout(3_000).emit(event, payload, (error: Error | null, response: any) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}
