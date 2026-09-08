import type { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env.config.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import type { RequestContext } from './auth.types.js';
import { AUTH_COOKIE_NAME } from './auth.constants.js';
import { authService } from './auth.service.js';

export class AuthController {
  signUp = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.signUp(request.body, getRequestContext(request));
    setRefreshCookie(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
    return sendSuccess(response, 201, 'Sign up successful. Please verify your email.', result);
  });

  verifyEmail = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.verifyEmail(request.body, getRequestContext(request));
    setRefreshCookie(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
    return sendSuccess(response, 200, 'Email verified successfully.', result);
  });

  resendVerification = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.resendVerification(request.body);
    return sendSuccess(response, 200, 'Verification code sent.', result);
  });

  login = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.login(request.body, getRequestContext(request));
    setRefreshCookie(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
    return sendSuccess(response, 200, 'Login successful.', result);
  });

  adminLogin = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.login(request.body, getRequestContext(request));
    
    if (result.user.role === 'user' || result.user.role === 'creator') {
      throw new UnauthorizedError('Access denied. Admin privileges required.', {
        code: 'FORBIDDEN',
      });
    }

    setRefreshCookie(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
    return sendSuccess(response, 200, 'Admin login successful.', result);
  });

  googleLogin = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.googleLogin(request.body, getRequestContext(request));
    setRefreshCookie(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
    return sendSuccess(response, 200, 'Google login successful.', result);
  });

  appleLogin = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.appleLogin(request.body, getRequestContext(request));
    setRefreshCookie(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
    return sendSuccess(response, 200, 'Apple login successful.', result);
  });

  refresh = asyncHandler(async (request: Request, response: Response) => {
    const refreshToken = getRefreshToken(request);

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token is required.', {
        code: 'REFRESH_TOKEN_REQUIRED',
      });
    }

    const result = await authService.refresh(refreshToken, getRequestContext(request));
    setRefreshCookie(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);
    return sendSuccess(response, 200, 'Token refreshed successfully.', result);
  });

  logout = asyncHandler(async (request: Request, response: Response) => {
    await authService.logout(getRefreshToken(request), request.user?.sessionId);
    clearRefreshCookie(response);
    return sendSuccess(response, 200, 'Logged out successfully.', { loggedOut: true });
  });

  forgotPassword = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.requestPasswordReset(request.body);
    return sendSuccess(
      response,
      200,
      'If the email exists, a reset code has been sent.',
      result,
    );
  });

  verifyResetCode = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.verifyPasswordResetCode(request.body);
    return sendSuccess(response, 200, 'Password reset code verified.', result);
  });

  resetPassword = asyncHandler(async (request: Request, response: Response) => {
    const result = await authService.resetPassword(request.body);
    clearRefreshCookie(response);
    return sendSuccess(response, 200, 'Password updated successfully.', result);
  });

  me = asyncHandler(async (request: Request, response: Response) => {
    if (!request.user) {
      throw new UnauthorizedError('Access token is required.', {
        code: 'ACCESS_TOKEN_REQUIRED',
      });
    }

    const result = await authService.getMe(request.user.userId);
    return sendSuccess(response, 200, 'Authenticated user fetched.', result);
  });

  changePassword = asyncHandler(async (request: Request, response: Response) => {
    if (!request.user) {
      throw new UnauthorizedError('Access token is required.', {
        code: 'ACCESS_TOKEN_REQUIRED',
      });
    }

    await authService.changePassword(request.user.userId, request.body);
    return sendSuccess(response, 200, 'Password updated successfully.', null);
  });

  updateProfile = asyncHandler(async (request: Request, response: Response) => {
    if (!request.user) {
      throw new UnauthorizedError('Access token is required.', {
        code: 'ACCESS_TOKEN_REQUIRED',
      });
    }

    const result = await authService.updateProfile(request.user.userId, request.body);
    return sendSuccess(response, 200, 'Profile updated successfully.', result);
  });

  completeProfile = asyncHandler(async (request: Request, response: Response) => {
    if (!request.user) {
      throw new UnauthorizedError('Access token is required.', {
        code: 'ACCESS_TOKEN_REQUIRED',
      });
    }

    console.log('--- SETUP PROFILE CALLED ---');
    console.log('Request Body:', request.body);
    console.log('Request File:', request.file ? `File present: ${request.file.originalname}` : 'No file');

    const file = request.file
      ? {
          buffer: request.file.buffer,
          mimetype: request.file.mimetype,
          originalName: request.file.originalname,
          size: request.file.size,
        }
      : undefined;

    const result = await authService.completeProfile(request.user.userId, request.body, file);
    return sendSuccess(response, 200, 'Profile setup completed.', result);
  });
}

function getRequestContext(request: Request): RequestContext {
  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(request.get('user-agent') ? { userAgent: request.get('user-agent') } : {}),
  };
}

function getRefreshToken(request: Request): string | undefined {
  if (typeof request.body?.refreshToken === 'string') {
    return request.body.refreshToken;
  }

  const cookies = request.cookies as Record<string, unknown> | undefined;
  const cookieRefreshToken = cookies?.[AUTH_COOKIE_NAME];
  return typeof cookieRefreshToken === 'string' ? cookieRefreshToken : undefined;
}

function setRefreshCookie(
  response: Response,
  refreshToken: string,
  refreshTokenExpiresAt: string,
): void {
  response.cookie(AUTH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions(),
    expires: new Date(refreshTokenExpiresAt),
  });
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(AUTH_COOKIE_NAME, refreshCookieOptions());
}

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
  };
}

export const authController = new AuthController();
