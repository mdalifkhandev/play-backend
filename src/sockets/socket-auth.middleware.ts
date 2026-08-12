import type { ExtendedError, Socket } from 'socket.io';

import { AccountStatus } from '../common/enums/account-status.enum.js';
import type { AccessTokenPayload } from '../common/interfaces/token-payload.interface.js';
import { verifyAccessToken } from '../common/utils/jwt.util.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { UserModel } from '../modules/users/user.model.js';
import type { AuthenticatedSocket, SocketUser } from './socket.types.js';

interface SocketAuthDependencies {
  verifyToken(token: string): Promise<AccessTokenPayload>;
  findActiveSession(sessionId: string): Promise<unknown | null>;
  findUser(userId: string): Promise<{
    status: AccountStatus;
    profile?: {
      username?: string;
      displayName?: string;
      photoUrl?: string;
    };
  } | null>;
  touchSession(sessionId: string): Promise<void>;
}

const defaultDependencies: SocketAuthDependencies = {
  verifyToken: verifyAccessToken,
  findActiveSession: (sessionId) => authRepository.findActiveSessionById(sessionId),
  findUser: async (userId) => UserModel.findById(userId).select('status profile').lean().exec(),
  touchSession: (sessionId) => authRepository.touchSession(sessionId),
};

export function createSocketAuthMiddleware(
  dependencies: SocketAuthDependencies = defaultDependencies,
): (socket: Socket, next: (error?: ExtendedError) => void) => Promise<void> {
  return async (socket, next): Promise<void> => {
    try {
      const token = extractSocketToken(socket);
      if (!token) {
        next(createAuthError('ACCESS_TOKEN_REQUIRED', 'Access token is required.'));
        return;
      }

      const payload = await dependencies.verifyToken(token);
      const [session, user] = await Promise.all([
        dependencies.findActiveSession(payload.sessionId),
        dependencies.findUser(payload.userId),
      ]);

      if (!session) {
        next(createAuthError('SESSION_REVOKED', 'Access token session is no longer active.'));
        return;
      }
      if (!user || user.status !== AccountStatus.ACTIVE) {
        next(createAuthError('ACCOUNT_UNAVAILABLE', 'User account is not active.'));
        return;
      }

      const socketUser: SocketUser = {
        id: payload.userId,
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
        ...(user.profile?.username ? { username: user.profile.username } : {}),
        ...(user.profile?.displayName ? { displayName: user.profile.displayName } : {}),
        ...(user.profile?.photoUrl ? { avatarUrl: user.profile.photoUrl } : {}),
      };

      socket.data.user = socketUser;
      (socket as AuthenticatedSocket).user = socketUser;
      await dependencies.touchSession(payload.sessionId);
      next();
    } catch {
      next(createAuthError('ACCESS_TOKEN_INVALID', 'Access token is invalid or expired.'));
    }
  };
}

export const socketAuthenticate = createSocketAuthMiddleware();

function extractSocketToken(socket: Socket): string | undefined {
  const authToken = socket.handshake.auth['token'];
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  const authorization = socket.handshake.headers.authorization;
  if (typeof authorization !== 'string') return undefined;
  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

function createAuthError(code: string, message: string): ExtendedError {
  const error = new Error(message) as ExtendedError & { data?: { code: string } };
  error.data = { code };
  return error;
}
