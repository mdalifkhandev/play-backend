import type { Socket } from 'socket.io';

import type { UserRole } from '../common/enums/user-role.enum.js';

export interface SocketUser {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export type AuthenticatedSocket = Socket & { user: SocketUser };

export interface SocketAck<T = unknown> {
  (response: { success: true; data: T } | { success: false; error: SocketErrorPayload }): void;
}

export interface SocketErrorPayload {
  event: string;
  code: string;
  message: string;
}

declare module 'socket.io' {
  interface SocketData {
    user?: SocketUser;
  }
}
