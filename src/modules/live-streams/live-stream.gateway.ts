import type { Server } from 'socket.io';

import { SOCKET_EVENTS } from '../../sockets/socket-events.js';
import type { LiveStreamResponseDTO } from './live-stream.types.js';

let socketServer: Server | undefined;

export function registerLiveStreamSocketServer(server: Server): void {
  socketServer = server;
}

export function broadcastLiveStreamStatus(stream: LiveStreamResponseDTO): void {
  socketServer?.to(`stream:${stream.id}`).emit(SOCKET_EVENTS.STREAM_STATUS_CHANGED, {
    streamId: stream.id,
    status: stream.status,
    startedAt: stream.startedAt,
    endedAt: stream.endedAt,
  });
}
