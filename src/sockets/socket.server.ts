import type { Server as HttpServer } from 'node:http';
import { Server, type ExtendedError, type Socket } from 'socket.io';

import { corsOrigins } from '../config/env.config.js';
import { logger } from '../infrastructure/logger/logger.js';
import { registerChatSocketHandlers } from './handlers/chat.socket.js';
import { registerLiveStreamSocketHandlers } from './handlers/live-stream.socket.js';
import { socketAuthenticate } from './socket-auth.middleware.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { getUserRoom } from './socket-rooms.js';
import type { AuthenticatedSocket } from './socket.types.js';
import type { ConversationService } from '../modules/conversations/conversation.service.js';
import { registerLiveStreamSocketServer } from '../modules/live-streams/live-stream.gateway.js';

interface SocketServerOptions {
  authMiddleware?: (socket: Socket, next: (error?: ExtendedError) => void) => void;
  chatService?: ConversationService;
  registerLiveHandlers?: boolean;
}

export function initializeSocketServer(
  httpServer: HttpServer,
  options: SocketServerOptions = {},
): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: [...corsOrigins],
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });
  registerLiveStreamSocketServer(io);

  io.use(options.authMiddleware ?? socketAuthenticate);
  io.on('connection', async (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userRoom = getUserRoom(socket.user.userId);
    await socket.join(userRoom);

    const userSockets = await io.in(userRoom).fetchSockets();
    if (userSockets.length === 1) {
      socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, {
        userId: socket.user.userId,
        online: true,
      });
    }

    registerChatSocketHandlers(io, socket, options.chatService);
    if (options.registerLiveHandlers !== false) {
      registerLiveStreamSocketHandlers(io, socket);
    }

    socket.on('disconnect', () => {
      void emitOfflineWhenLastSocketDisconnects(io, socket.user.userId);
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
}

async function emitOfflineWhenLastSocketDisconnects(io: Server, userId: string): Promise<void> {
  const sockets = await io.in(getUserRoom(userId)).fetchSockets();
  if (sockets.length === 0) {
    io.emit(SOCKET_EVENTS.USER_OFFLINE, { userId, online: false });
  }
}
