import { randomInt } from 'node:crypto';

import { env } from '../../config/env.config.js';
import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { AppError } from '../../common/errors/app-error.js';
import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { ConflictError } from '../../common/errors/conflict-error.js';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { createSecureToken, hashPassword, sha256, verifyPassword } from '../../common/utils/hash.util.js';
import { signAccessToken } from '../../common/utils/jwt.util.js';
import { mailService } from '../../infrastructure/mail/mail.service.js';
import { legalConsentService } from '../legal-consents/legal-consent.service.js';
import { userRepository } from '../users/user.repository.js';
import { toPublicUser, type PublicUserDto } from '../users/user.mapper.js';
import type { UserDocument, UserProfile } from '../users/user.model.js';
import { authRepository } from './auth.repository.js';
import type { AuthCodeDocument, AuthCodePurpose } from './auth-code.model.js';
import { AUTH_ERROR_CODES } from './auth.constants.js';
import type {
  AuthResult,
  AuthTokenSet,
  PasswordResetVerificationResult,
  RequestContext,
  UploadedProfilePhoto,
  VerificationResult,
} from './auth.types.js';
import type {
  EmailInput,
  GoogleLoginInput,
  LoginInput,
  ResetPasswordInput,
  SetupProfileInput,
  SignUpInput,
  VerifyCodeInput,
} from './auth.validation.js';

export class AuthService {
  async signUp(
    input: SignUpInput,
    context: RequestContext,
  ): Promise<{ user: PublicUserDto; verification: VerificationResult }> {
    const existingUser = await userRepository.existsByEmail(input.email);

    if (existingUser) {
      throw new ConflictError('Email already registered.', {
        code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
        fieldErrors: [
          {
            field: 'email',
            message: 'Email already registered.',
            code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
          },
        ],
      });
    }

    if (env.REQUIRE_LEGAL_CONSENT_ON_SIGNUP && !input.legalConsents) {
      throw new BadRequestError('Current legal document versions must be accepted.', {
        code: 'LEGAL_CONSENT_REQUIRED',
        fieldErrors: [
          {
            field: 'legalConsents',
            message: 'Review and accept the current Terms and Privacy Policy.',
            code: 'LEGAL_CONSENT_REQUIRED',
          },
        ],
      });
    }

    if (input.legalConsents) {
      await legalConsentService.assertCurrentVersions(input.legalConsents);
    }

    const user = await userRepository.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      status: AccountStatus.ACTIVE,
      isEmailVerified: false,
    });

    if (input.legalConsents) {
      await legalConsentService.acceptInitialConsents(
        user._id.toString(),
        input.legalConsents,
        {
          ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      );
    }

    const verification = await this.createAndDispatchCode(
      user,
      'email_verification',
    );

    return {
      user: toPublicUser(user),
      verification,
    };
  }

  async login(input: LoginInput, context: RequestContext): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email, { includePassword: true });

    if (!user) {
      throw new UnauthorizedError('Email address not found.', {
        code: AUTH_ERROR_CODES.EMAIL_NOT_FOUND,
        fieldErrors: [
          {
            field: 'email',
            message: 'Email address not found.',
            code: AUTH_ERROR_CODES.EMAIL_NOT_FOUND,
          },
        ],
      });
    }

    this.assertUserCanLogin(user);

    const passwordMatches = await verifyPassword(user.passwordHash, input.password);

    if (!passwordMatches) {
      await userRepository.recordFailedLogin(user);

      throw new UnauthorizedError('Password is wrong.', {
        code: AUTH_ERROR_CODES.WRONG_PASSWORD,
        fieldErrors: [
          {
            field: 'password',
            message: 'Password is wrong.',
            code: AUTH_ERROR_CODES.WRONG_PASSWORD,
          },
        ],
      });
    }

    if (!user.isEmailVerified) {
      await this.createAndDispatchCode(
        user,
        'email_verification',
      );

      throw new ForbiddenError('Please verify your email before login.', {
        code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
        fieldErrors: [
          {
            field: 'email',
            message: 'Please verify your email before login.',
            code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
          },
        ],
      });
    }

    await userRepository.recordSuccessfulLogin(user);

    return this.createAuthResult(user, Boolean(input.rememberMe), context);
  }

  async googleLogin(input: GoogleLoginInput, context: RequestContext): Promise<AuthResult> {
    const googleUser = await this.verifyGoogleIdToken(input.idToken);
    let user = await userRepository.findByEmail(googleUser.email);

    if (!user) {
      const createdUser = await userRepository.create({
        email: googleUser.email,
        passwordHash: await hashPassword(createSecureToken()),
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
      });

      const updatedUser = await userRepository.updateProfile(createdUser._id, {
        ...(googleUser.name ? { displayName: googleUser.name } : {}),
        ...(googleUser.picture ? { photoUrl: googleUser.picture } : {}),
        isSetupComplete: false,
      });

      user = updatedUser ?? createdUser;
    } else {
      this.assertUserCanLogin(user);

      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        user.emailVerifiedAt = new Date();
      }

      if (!user.profile.displayName && googleUser.name) {
        user.profile.displayName = googleUser.name;
      }

      if (!user.profile.photoUrl && googleUser.picture) {
        user.profile.photoUrl = googleUser.picture;
      }
    }

    await userRepository.recordSuccessfulLogin(user);

    return this.createAuthResult(user, Boolean(input.rememberMe), context);
  }

  async verifyEmail(input: VerifyCodeInput): Promise<{ user: PublicUserDto }> {
    const user = await userRepository.findByEmail(input.email);

    if (!user) {
      throw this.invalidCodeError();
    }

    const authCode = await this.requireValidCode(
      input.email,
      'email_verification',
      input.code,
    );

    const verifiedUser = await userRepository.markEmailVerified(user._id);
    await authRepository.consumeAuthCode(authCode._id);

    if (!verifiedUser) {
      throw new BadRequestError('User could not be verified.', {
        code: 'USER_VERIFY_FAILED',
      });
    }

    return { user: toPublicUser(verifiedUser) };
  }

  async resendVerification(input: EmailInput): Promise<VerificationResult> {
    const user = await userRepository.findByEmail(input.email);

    if (!user) {
      throw new UnauthorizedError('Email address not found.', {
        code: AUTH_ERROR_CODES.EMAIL_NOT_FOUND,
        fieldErrors: [
          {
            field: 'email',
            message: 'Email address not found.',
            code: AUTH_ERROR_CODES.EMAIL_NOT_FOUND,
          },
        ],
      });
    }

    if (user.isEmailVerified) {
      return {
        email: user.email,
        expiresAt: new Date().toISOString(),
      };
    }

    return this.createAndDispatchCode(
      user,
      'email_verification',
    );
  }

  async requestPasswordReset(input: EmailInput): Promise<VerificationResult> {
    const user = await userRepository.findByEmail(input.email);

    if (!user) {
      return {
        email: input.email,
        expiresAt: this.codeExpiresAt().toISOString(),
      };
    }

    return this.createAndDispatchCode(
      user,
      'password_reset',
    );
  }

  async verifyPasswordResetCode(
    input: VerifyCodeInput,
  ): Promise<PasswordResetVerificationResult> {
    const authCode = await this.requireValidCode(input.email, 'password_reset', input.code);

    const resetToken = createSecureToken();
    const resetTokenExpiresAt = new Date(
      Date.now() + env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1_000,
    );

    await authRepository.markResetCodeVerified(authCode._id, resetToken, resetTokenExpiresAt);

    return {
      email: input.email,
      resetToken,
      expiresAt: resetTokenExpiresAt.toISOString(),
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ user: PublicUserDto }> {
    const authCode = await authRepository.findResetCodeByToken(input.resetToken);

    if (!authCode) {
      throw new BadRequestError('Password reset token is invalid or expired.', {
        code: AUTH_ERROR_CODES.RESET_TOKEN_INVALID,
        fieldErrors: [
          {
            field: 'resetToken',
            message: 'Password reset token is invalid or expired.',
            code: AUTH_ERROR_CODES.RESET_TOKEN_INVALID,
          },
        ],
      });
    }

    await userRepository.updatePassword(authCode.userId, await hashPassword(input.newPassword));
    await authRepository.consumeAuthCode(authCode._id);
    await authRepository.revokeAllUserSessions(authCode.userId);

    const user = await userRepository.findById(authCode.userId);

    if (!user) {
      throw new BadRequestError('User not found for password reset.', {
        code: 'PASSWORD_RESET_USER_NOT_FOUND',
      });
    }

    return { user: toPublicUser(user) };
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<AuthResult> {
    const session = await authRepository.findActiveSessionByRefreshToken(refreshToken);

    if (!session) {
      throw new UnauthorizedError('Refresh token is invalid or expired.', {
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    const user = await userRepository.findById(session.userId);

    if (!user) {
      await authRepository.revokeSession(session._id);
      throw new UnauthorizedError('Refresh token is invalid or expired.', {
        code: 'REFRESH_TOKEN_INVALID',
      });
    }

    this.assertUserCanLogin(user);

    const nextRefreshToken = createSecureToken();
    const nextExpiresAt = this.refreshExpiresAt(session.rememberMe);
    const nextSession = await authRepository.createSession({
      userId: user._id,
      refreshToken: nextRefreshToken,
      rememberMe: session.rememberMe,
      expiresAt: nextExpiresAt,
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    });

    await authRepository.revokeSession(session._id, nextSession._id);

    return {
      user: toPublicUser(user),
      tokens: await this.createTokenSet(user, nextSession._id.toString(), nextRefreshToken, nextExpiresAt),
    };
  }

  async logout(refreshToken?: string, sessionId?: string): Promise<void> {
    if (refreshToken) {
      const session = await authRepository.findActiveSessionByRefreshToken(refreshToken);

      if (session) {
        await authRepository.revokeSession(session._id);
      }

      return;
    }

    if (sessionId) {
      await authRepository.revokeSession(sessionId);
    }
  }

  async getMe(userId: string): Promise<{ user: PublicUserDto }> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedError('Authenticated user was not found.', {
        code: 'AUTHENTICATED_USER_NOT_FOUND',
      });
    }

    return { user: toPublicUser(user) };
  }

  async completeProfile(
    userId: string,
    input: SetupProfileInput,
    photo?: UploadedProfilePhoto,
  ): Promise<{ user: PublicUserDto }> {
    if (input.username) {
      const usernameTaken = await userRepository.existsByUsername(input.username, userId);

      if (usernameTaken) {
        throw new ConflictError('Username already taken.', {
          code: AUTH_ERROR_CODES.USERNAME_TAKEN,
          fieldErrors: [
            {
              field: 'username',
              message: 'Username already taken.',
              code: AUTH_ERROR_CODES.USERNAME_TAKEN,
            },
          ],
        });
      }
    }

    if (input.phoneNumber) {
      const phoneNumberTaken = await userRepository.existsByPhoneNumber(input.phoneNumber, userId);

      if (phoneNumberTaken) {
        throw new ConflictError('Phone number already in use.', {
          code: AUTH_ERROR_CODES.PHONE_NUMBER_TAKEN,
          fieldErrors: [
            {
              field: 'phoneNumber',
              message: 'Phone number already in use.',
              code: AUTH_ERROR_CODES.PHONE_NUMBER_TAKEN,
            },
          ],
        });
      }
    }

    const profile: Partial<UserProfile> = {
      isSetupComplete: true,
    };

    if (input.username !== undefined) {
      profile.username = input.username;
    }

    if (input.displayName !== undefined) {
      profile.displayName = input.displayName;
    }

    if (input.bio !== undefined) {
      profile.bio = input.bio;
    }

    if (input.instagram !== undefined) {
      profile.instagram = input.instagram;
    }

    if (input.youtube !== undefined) {
      profile.youtube = input.youtube;
    }

    if (input.photoUrl !== undefined) {
      profile.photoUrl = input.photoUrl;
    }

    if (input.photoPublicId !== undefined) {
      profile.photoPublicId = input.photoPublicId;
    }

    if (photo) {
      const { cloudinaryStorage } = await import('../../infrastructure/storage/index.js');
      const uploaded = await cloudinaryStorage.uploadBuffer(photo.buffer, {
        folder: `${env.CLOUDINARY_UPLOAD_FOLDER}/profiles`,
        resourceType: 'image',
        tags: ['profile-photo', userId],
      });

      profile.photoUrl = uploaded.secureUrl;
      profile.photoPublicId = uploaded.publicId;
    }

    const user = await userRepository.updateProfile(userId, profile, {
      ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
      ...(input.dateOfBirth
        ? { dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`) }
        : {}),
    });

    if (!user) {
      throw new UnauthorizedError('Authenticated user was not found.', {
        code: 'AUTHENTICATED_USER_NOT_FOUND',
      });
    }

    return { user: toPublicUser(user) };
  }

  private async createAuthResult(
    user: UserDocument,
    rememberMe: boolean,
    context: RequestContext,
  ): Promise<AuthResult> {
    const refreshToken = createSecureToken();
    const refreshExpiresAt = this.refreshExpiresAt(rememberMe);
    const session = await authRepository.createSession({
      userId: user._id,
      refreshToken,
      rememberMe,
      expiresAt: refreshExpiresAt,
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    });

    return {
      user: toPublicUser(user),
      tokens: await this.createTokenSet(
        user,
        session._id.toString(),
        refreshToken,
        refreshExpiresAt,
      ),
    };
  }

  private async createTokenSet(
    user: UserDocument,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AuthTokenSet> {
    return {
      accessToken: await signAccessToken({
        type: 'access',
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      }),
      refreshToken,
      accessTokenExpiresInSeconds: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private async verifyGoogleIdToken(idToken: string): Promise<{
    email: string;
    name?: string;
    picture?: string;
  }> {
    const allowedAudiences = [
      env.GOOGLE_ANDROID_CLIENT_ID,
      env.GOOGLE_IOS_CLIENT_ID,
      env.GOOGLE_WEB_CLIENT_ID,
    ].filter((clientId): clientId is string => Boolean(clientId));

    if (allowedAudiences.length === 0) {
      throw new AppError('Google login is not configured.', 503, {
        code: 'GOOGLE_LOGIN_NOT_CONFIGURED',
      });
    }

    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );

    if (!response.ok) {
      throw new UnauthorizedError('Google token is invalid.', {
        code: 'GOOGLE_TOKEN_INVALID',
      });
    }

    const payload = (await response.json()) as {
      aud?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      picture?: string;
    };

    if (!payload.aud || !allowedAudiences.includes(payload.aud)) {
      throw new UnauthorizedError('Google token audience is not allowed.', {
        code: 'GOOGLE_TOKEN_AUDIENCE_INVALID',
      });
    }

    const isEmailVerified =
      payload.email_verified === true || payload.email_verified === 'true';

    if (!payload.email || !isEmailVerified) {
      throw new UnauthorizedError('Google email is not verified.', {
        code: 'GOOGLE_EMAIL_NOT_VERIFIED',
      });
    }

    return {
      email: payload.email.toLowerCase(),
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.picture ? { picture: payload.picture } : {}),
    };
  }

  private async createAndDispatchCode(
    user: UserDocument,
    purpose: 'email_verification' | 'password_reset',
  ): Promise<VerificationResult> {
    const code = this.generateSixDigitCode();
    const expiresAt = this.codeExpiresAt();

    await authRepository.createAuthCode({
      userId: user._id,
      email: user.email,
      purpose,
      code,
      expiresAt,
    });

    await mailService.sendAuthCode({
      to: user.email,
      code,
      purpose,
      expiresInMinutes: env.AUTH_CODE_TTL_MINUTES,
    });

    return {
      email: user.email,
      expiresAt: expiresAt.toISOString(),
      ...(env.NODE_ENV === 'production' ? {} : { devCode: code }),
    };
  }

  private async requireValidCode(
    email: string,
    purpose: AuthCodePurpose,
    code: string,
  ): Promise<AuthCodeDocument> {
    const authCode = await authRepository.findActiveAuthCode(email, purpose);

    if (!authCode) {
      throw this.invalidCodeError();
    }

    if (authCode.attempts >= env.AUTH_MAX_CODE_ATTEMPTS) {
      await authRepository.consumeAuthCode(authCode._id);

      throw new BadRequestError('Verification code has expired. Please request a new code.', {
        code: AUTH_ERROR_CODES.CODE_EXPIRED,
        fieldErrors: [
          {
            field: 'code',
            message: 'Verification code has expired. Please request a new code.',
            code: AUTH_ERROR_CODES.CODE_EXPIRED,
          },
        ],
      });
    }

    if (sha256(code) !== authCode.codeHash) {
      await authRepository.incrementCodeAttempts(authCode);
      throw this.invalidCodeError();
    }

    return authCode;
  }

  private invalidCodeError(): BadRequestError {
    return new BadRequestError('Verification code is invalid.', {
      code: AUTH_ERROR_CODES.INVALID_CODE,
      fieldErrors: [
        {
          field: 'code',
          message: 'Verification code is invalid.',
          code: AUTH_ERROR_CODES.INVALID_CODE,
        },
      ],
    });
  }

  private assertUserCanLogin(user: UserDocument): void {
    if (user.status === AccountStatus.SUSPENDED || user.status === AccountStatus.DELETED) {
      throw new ForbiddenError('This account is not allowed to login.', {
        code: 'ACCOUNT_NOT_ALLOWED',
      });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError('Account locked. Please try again later.', 423, {
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        fieldErrors: [
          {
            field: 'password',
            message: 'Too many wrong password attempts. Please try again later.',
            code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
          },
        ],
      });
    }
  }

  private refreshExpiresAt(rememberMe: boolean): Date {
    const days = rememberMe ? env.AUTH_REMEMBER_ME_REFRESH_TOKEN_DAYS : env.AUTH_REFRESH_TOKEN_DAYS;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
  }

  private codeExpiresAt(): Date {
    return new Date(Date.now() + env.AUTH_CODE_TTL_MINUTES * 60 * 1_000);
  }

  private generateSixDigitCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}

export const authService = new AuthService();
