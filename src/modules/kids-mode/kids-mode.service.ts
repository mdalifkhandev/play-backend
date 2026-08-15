import { AppError } from '../../common/errors/app-error.js';
import { Types } from 'mongoose';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { hashPassword, verifyPassword } from '../../common/utils/hash.util.js';
import { reelService, type ReelFeedResult } from '../reels/reel.service.js';
import type { ReelFeedQuery } from '../reels/reel.validation.js';
import type { KidsModeDocument } from './kids-mode.model.js';
import { kidsModeRepository, type KidsModeRepository } from './kids-mode.repository.js';
import type { SetupKidsModeInput, VerifyKidsPinInput } from './kids-mode.validation.js';

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1_000;

export interface KidsModeStatus {
  configured: boolean;
  isActive: boolean;
  canWatch: boolean;
  childNickname: string | null;
  ageGroup: string | null;
  dailyLimitMinutes: number | null;
  usedSeconds: number;
  remainingSeconds: number;
  limitReached: boolean;
}

export class KidsModeService {
  constructor(
    private readonly repository: KidsModeRepository = kidsModeRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async setup(userId: string, input: SetupKidsModeInput): Promise<KidsModeStatus> {
    const existing = await this.repository.findByUserId(userId, true);

    if (existing) {
      if (!input.currentPin) {
        throw new UnauthorizedError('Current parental PIN is required.', {
          code: 'KIDS_CURRENT_PIN_REQUIRED',
        });
      }
      await this.verifyPin(existing, input.currentPin);
    }

    const current = this.now();
    const pinHash = await hashPassword(input.pin);
    const values = {
      pinHash,
      ...(input.childNickname ? { childNickname: input.childNickname } : {}),
      ageGroup: input.ageGroup,
      dailyLimitMinutes: input.dailyLimitMinutes,
      isActive: true,
      sessionStartedAt: current,
      usageDate: toUsageDate(current),
      usedSeconds: existing ? this.currentUsedSeconds(existing, current) : 0,
      failedPinAttempts: 0,
    };

    const document = existing
      ? await this.repository.update(userId, {
          $set: values,
          ...(!input.childNickname ? { $unset: { childNickname: 1, pinLockedUntil: 1 } } : { $unset: { pinLockedUntil: 1 } }),
        })
      : await this.repository.create({ userId: new Types.ObjectId(userId), ...values });

    if (!document) throw new AppError('Kids Mode could not be saved.', 500, { code: 'KIDS_SETUP_FAILED' });
    return this.toStatus(document, current);
  }

  async enter(userId: string, input: VerifyKidsPinInput): Promise<KidsModeStatus> {
    const document = await this.requireConfigured(userId, true);
    await this.verifyPin(document, input.pin);
    const current = this.now();
    await this.normalizeDailyUsage(document, current);
    const usedSeconds = this.currentUsedSeconds(document, current);

    if (usedSeconds >= document.dailyLimitMinutes * 60) {
      throw new ForbiddenError("Today's Kids Mode screen-time limit has been reached.", {
        code: 'KIDS_TIME_LIMIT_REACHED',
      });
    }

    document.usedSeconds = usedSeconds;
    document.isActive = true;
    document.sessionStartedAt = current;
    await this.repository.save(document);
    return this.toStatus(document, current);
  }

  async exit(userId: string, input: VerifyKidsPinInput): Promise<KidsModeStatus> {
    const document = await this.requireConfigured(userId, true);
    await this.verifyPin(document, input.pin);
    const current = this.now();
    await this.normalizeDailyUsage(document, current);
    document.usedSeconds = this.currentUsedSeconds(document, current);
    document.isActive = false;
    delete document.sessionStartedAt;
    await this.repository.save(document);
    return this.toStatus(document, current);
  }

  async getStatus(userId: string): Promise<KidsModeStatus> {
    const document = await this.repository.findByUserId(userId);
    if (!document) return emptyStatus();

    const current = this.now();
    await this.normalizeDailyUsage(document, current);
    return this.toStatus(document, current);
  }

  async getFeed(userId: string, query: ReelFeedQuery): Promise<ReelFeedResult> {
    const status = await this.getStatus(userId);
    if (!status.configured) {
      throw new NotFoundError('Kids Mode has not been set up.', { code: 'KIDS_MODE_NOT_CONFIGURED' });
    }
    if (status.limitReached) {
      throw new ForbiddenError("Today's Kids Mode screen-time limit has been reached.", {
        code: 'KIDS_TIME_LIMIT_REACHED',
      });
    }
    if (!status.isActive) {
      throw new ForbiddenError('Enter Kids Mode with the parental PIN first.', {
        code: 'KIDS_MODE_NOT_ACTIVE',
      });
    }
    return reelService.getKidsFeed(query, userId);
  }

  private async requireConfigured(userId: string, includePin: boolean): Promise<KidsModeDocument> {
    const document = await this.repository.findByUserId(userId, includePin);
    if (!document) {
      throw new NotFoundError('Kids Mode has not been set up.', { code: 'KIDS_MODE_NOT_CONFIGURED' });
    }
    return document;
  }

  private async verifyPin(document: KidsModeDocument, pin: string): Promise<void> {
    const current = this.now();
    if (document.pinLockedUntil && document.pinLockedUntil > current) {
      throw new AppError('Too many incorrect PIN attempts. Try again later.', 429, {
        code: 'KIDS_PIN_LOCKED',
      });
    }

    if (await verifyPassword(document.pinHash, pin)) {
      document.failedPinAttempts = 0;
      delete document.pinLockedUntil;
      await this.repository.save(document);
      return;
    }

    document.failedPinAttempts += 1;
    if (document.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
      document.pinLockedUntil = new Date(current.getTime() + PIN_LOCK_MS);
      document.failedPinAttempts = 0;
    }
    await this.repository.save(document);
    throw new UnauthorizedError('Parental PIN is incorrect.', { code: 'KIDS_PIN_INVALID' });
  }

  private async normalizeDailyUsage(document: KidsModeDocument, current: Date): Promise<void> {
    const usageDate = toUsageDate(current);
    if (document.usageDate === usageDate) return;
    document.usageDate = usageDate;
    document.usedSeconds = 0;
    if (document.isActive) {
      document.sessionStartedAt = current;
    } else {
      delete document.sessionStartedAt;
    }
    await this.repository.save(document);
  }

  private currentUsedSeconds(document: KidsModeDocument, current: Date): number {
    if (!document.isActive || !document.sessionStartedAt) return document.usedSeconds;
    return document.usedSeconds + Math.max(0, Math.floor((current.getTime() - document.sessionStartedAt.getTime()) / 1_000));
  }

  private toStatus(document: KidsModeDocument, current: Date): KidsModeStatus {
    const usedSeconds = this.currentUsedSeconds(document, current);
    const limitSeconds = document.dailyLimitMinutes * 60;
    const limitReached = usedSeconds >= limitSeconds;
    return {
      configured: true,
      isActive: document.isActive,
      canWatch: document.isActive && !limitReached,
      childNickname: document.childNickname ?? null,
      ageGroup: document.ageGroup,
      dailyLimitMinutes: document.dailyLimitMinutes,
      usedSeconds,
      remainingSeconds: Math.max(0, limitSeconds - usedSeconds),
      limitReached,
    };
  }
}

function toUsageDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function emptyStatus(): KidsModeStatus {
  return {
    configured: false,
    isActive: false,
    canWatch: false,
    childNickname: null,
    ageGroup: null,
    dailyLimitMinutes: null,
    usedSeconds: 0,
    remainingSeconds: 0,
    limitReached: false,
  };
}

export const kidsModeService = new KidsModeService();
