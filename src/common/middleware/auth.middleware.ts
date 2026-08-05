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
    await attachAuthenticatedUser(request, true);
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuthenticate(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await attachAuthenticatedUser(request, false);
    next();
  } catch (error) {
    next(error);
  }
}

async function attachAuthenticatedUser(
  request: Request,
  required: boolean,
): Promise<void> {
  const token = extractBearerToken(request);

  if (!token) {
    if (required) {
      throw new UnauthorizedError('Access token is required.', {
        code: 'ACCESS_TOKEN_REQUIRED',
      });
    }

    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    const session = await authRepository.findActiveSessionById(payload.sessionId);

    if (!session) {
      if (required) {
        throw new UnauthorizedError('Access token session is no longer active.', {
          code: 'SESSION_REVOKED',
        });
      }

      return;
    }

    request.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    };

    await authRepository.touchSession(payload.sessionId);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    if (required) {
      throw new UnauthorizedError('Access token is invalid or expired.', {
        code: 'ACCESS_TOKEN_INVALID',
      });
    }
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
