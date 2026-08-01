import type { PublicUserDto } from '../users/user.mapper.js';

export interface RequestContext {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthTokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresAt: string;
}

export interface AuthResult {
  user: PublicUserDto;
  tokens: AuthTokenSet;
}

export interface VerificationResult {
  email: string;
  expiresAt: string;
  devCode?: string;
}

export interface PasswordResetVerificationResult {
  email: string;
  resetToken: string;
  expiresAt: string;
}

export interface UploadedProfilePhoto {
  buffer: Buffer;
  mimetype: string;
  originalName: string;
  size: number;
}
