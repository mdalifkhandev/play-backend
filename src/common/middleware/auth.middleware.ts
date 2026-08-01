import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { authRepository } from '../../modules/auth/auth.repository.js';

export async function authenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedError('Access token is required.', {
        code: 'ACCESS_TOKEN_REQUIRED',
      });
    }

    const payload = await verifyAccessToken(token);
    const session = await authRepository.findActiveSessionById(payload.sessionId);

    if (!session) {
      throw new UnauthorizedError('Access token session is no longer active.', {
        code: 'SESSION_REVOKED',
      });
    }

    request.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    };

    await authRepository.touchSession(payload.sessionId);
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
      return;
    }

    next(
      new UnauthorizedError('Access token is invalid or expired.', {
        code: 'ACCESS_TOKEN_INVALID',
      }),
    );
  }
}

function extractBearerToken(request: Request): string | undefined {
  const authorization = request.header('authorization');

  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token;
}
