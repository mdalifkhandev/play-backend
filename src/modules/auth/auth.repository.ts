import type { Types } from 'mongoose';

import { sha256 } from '../../common/utils/hash.util.js';
import { SessionModel, type SessionDocument } from '../sessions/session.model.js';
import { AuthCodeModel, type AuthCodeDocument, type AuthCodePurpose } from './auth-code.model.js';
import { PendingSignupModel, type PendingSignupDocument } from './pending-signup.model.js';

interface CreateSessionInput {
  userId: Types.ObjectId;
  refreshToken: string;
  rememberMe: boolean;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

interface CreateAuthCodeInput {
  userId: Types.ObjectId;
  email: string;
  purpose: AuthCodePurpose;
  code: string;
  expiresAt: Date;
}

interface UpsertPendingSignupInput {
  email: string;
  passwordHash: string;
  legalConsents?: unknown;
  ipAddress?: string;
  userAgent?: string;
  code: string;
  expiresAt: Date;
}

export class AuthRepository {
  async createSession(input: CreateSessionInput): Promise<SessionDocument> {
    return SessionModel.create({
      userId: input.userId,
      refreshTokenHash: sha256(input.refreshToken),
      rememberMe: input.rememberMe,
      expiresAt: input.expiresAt,
      lastUsedAt: new Date(),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    });
  }

  async findActiveSessionByRefreshToken(
    refreshToken: string,
  ): Promise<SessionDocument | null> {
    return SessionModel.findOne({
      refreshTokenHash: sha256(refreshToken),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).exec();
  }

  async findActiveSessionById(sessionId: string): Promise<SessionDocument | null> {
    return SessionModel.findOne({
      _id: sessionId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).exec();
  }

  async revokeSession(
    sessionId: string | Types.ObjectId,
    replacementSessionId?: Types.ObjectId,
  ): Promise<void> {
    await SessionModel.updateOne(
      { _id: sessionId, revokedAt: { $exists: false } },
      {
        $set: {
          revokedAt: new Date(),
          ...(replacementSessionId ? { replacedBySessionId: replacementSessionId } : {}),
        },
      },
    ).exec();
  }

  async revokeAllUserSessions(userId: string | Types.ObjectId): Promise<void> {
    await SessionModel.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }

  async touchSession(sessionId: string | Types.ObjectId): Promise<void> {
    await SessionModel.updateOne(
      { _id: sessionId },
      { $set: { lastUsedAt: new Date() } },
    ).exec();
  }

  async createAuthCode(input: CreateAuthCodeInput): Promise<AuthCodeDocument> {
    await AuthCodeModel.updateMany(
      {
        userId: input.userId,
        purpose: input.purpose,
        consumedAt: { $exists: false },
      },
      { $set: { consumedAt: new Date() } },
    ).exec();

    return AuthCodeModel.create({
      userId: input.userId,
      email: input.email,
      purpose: input.purpose,
      codeHash: sha256(input.code),
      expiresAt: input.expiresAt,
    });
  }

  async upsertPendingSignup(input: UpsertPendingSignupInput): Promise<PendingSignupDocument> {
    const set: Record<string, unknown> = {
      email: input.email,
      passwordHash: input.passwordHash,
      codeHash: sha256(input.code),
      attempts: 0,
      expiresAt: input.expiresAt,
    };
    const unset: Record<string, ''> = {};

    if (input.legalConsents) set.legalConsents = input.legalConsents;
    else unset.legalConsents = '';
    if (input.ipAddress) set.ipAddress = input.ipAddress;
    else unset.ipAddress = '';
    if (input.userAgent) set.userAgent = input.userAgent;
    else unset.userAgent = '';

    return PendingSignupModel.findOneAndUpdate(
      { email: input.email },
      {
        $set: set,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async findPendingSignupByEmail(email: string): Promise<PendingSignupDocument | null> {
    return PendingSignupModel.findOne({
      email,
      expiresAt: { $gt: new Date() },
    }).exec();
  }

  async deletePendingSignup(pendingSignupId: string | Types.ObjectId): Promise<void> {
    await PendingSignupModel.deleteOne({ _id: pendingSignupId }).exec();
  }

  async incrementPendingSignupAttempts(pendingSignup: PendingSignupDocument): Promise<void> {
    pendingSignup.attempts += 1;
    await pendingSignup.save();
  }

  async findActiveAuthCode(
    email: string,
    purpose: AuthCodePurpose,
  ): Promise<AuthCodeDocument | null> {
    return AuthCodeModel.findOne({
      email,
      purpose,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  async consumeAuthCode(codeId: string | Types.ObjectId): Promise<void> {
    await AuthCodeModel.updateOne(
      { _id: codeId },
      { $set: { consumedAt: new Date() } },
    ).exec();
  }

  async incrementCodeAttempts(code: AuthCodeDocument): Promise<void> {
    code.attempts += 1;
    await code.save();
  }

  async markResetCodeVerified(
    codeId: string | Types.ObjectId,
    resetToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await AuthCodeModel.updateOne(
      { _id: codeId },
      {
        $set: {
          verifiedAt: new Date(),
          resetTokenHash: sha256(resetToken),
          resetTokenExpiresAt: expiresAt,
        },
      },
    ).exec();
  }

  async findResetCodeByToken(resetToken: string): Promise<AuthCodeDocument | null> {
    return AuthCodeModel.findOne({
      purpose: 'password_reset',
      resetTokenHash: sha256(resetToken),
      verifiedAt: { $exists: true },
      consumedAt: { $exists: false },
      resetTokenExpiresAt: { $gt: new Date() },
    }).exec();
  }
}

export const authRepository = new AuthRepository();
