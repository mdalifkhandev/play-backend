import { describe, expect, it, vi } from 'vitest';

import { AccountStatus } from '../src/common/enums/account-status.enum.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { createSocketAuthMiddleware } from '../src/sockets/socket-auth.middleware.js';

describe('Socket authentication middleware', () => {
  const payload = {
    type: 'access' as const,
    userId: '640000000000000000000001',
    email: 'user@example.com',
    role: UserRole.USER,
    sessionId: '640000000000000000000010',
  };

  it('attaches the authenticated user from handshake auth', async () => {
    const touchSession = vi.fn(async () => undefined);
    const middleware = createSocketAuthMiddleware({
      verifyToken: async () => payload,
      findActiveSession: async () => ({ id: payload.sessionId }),
      findUser: async () => ({
        status: AccountStatus.ACTIVE,
        profile: {
          username: 'ratul',
          displayName: 'Ratul',
          photoUrl: 'https://example.com/avatar.jpg',
        },
      }),
      touchSession,
    });
    const socket = createMockSocket('Bearer valid-token');

    const error = await runMiddleware(middleware, socket);

    expect(error).toBeUndefined();
    expect(socket.user).toMatchObject({
      userId: payload.userId,
      username: 'ratul',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
    expect(socket.data.user).toEqual(socket.user);
    expect(touchSession).toHaveBeenCalledWith(payload.sessionId);
  });

  it('rejects a connection without an access token', async () => {
    const middleware = createSocketAuthMiddleware(createDependencies());
    const error = await runMiddleware(middleware, createMockSocket(undefined));
    expect(error?.data).toEqual({ code: 'ACCESS_TOKEN_REQUIRED' });
  });

  it('rejects a revoked session', async () => {
    const middleware = createSocketAuthMiddleware(
      createDependencies({ findActiveSession: async () => null }),
    );
    const error = await runMiddleware(middleware, createMockSocket('valid-token'));
    expect(error?.data).toEqual({ code: 'SESSION_REVOKED' });
  });

  it('rejects an inactive account', async () => {
    const middleware = createSocketAuthMiddleware(
      createDependencies({
        findUser: async () => ({ status: AccountStatus.SUSPENDED }),
      }),
    );
    const error = await runMiddleware(middleware, createMockSocket('valid-token'));
    expect(error?.data).toEqual({ code: 'ACCOUNT_UNAVAILABLE' });
  });

  function createDependencies(overrides: Record<string, unknown> = {}): any {
    return {
      verifyToken: async () => payload,
      findActiveSession: async () => ({ id: payload.sessionId }),
      findUser: async () => ({ status: AccountStatus.ACTIVE }),
      touchSession: async () => undefined,
      ...overrides,
    };
  }
});

function createMockSocket(token: string | undefined): any {
  return {
    handshake: {
      auth: token ? { token } : {},
      headers: {},
    },
    data: {},
  };
}

async function runMiddleware(middleware: any, socket: any): Promise<any> {
  return new Promise((resolve) => {
    void middleware(socket, (error?: Error) => resolve(error));
  });
}
