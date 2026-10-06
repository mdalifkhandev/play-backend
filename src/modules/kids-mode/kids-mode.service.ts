import { AppError } from '../../common/errors/app-error.js';
import { Types } from 'mongoose';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { hashPassword, verifyPassword } from '../../common/utils/hash.util.js';
import { ReelStatus, ReelVisibility } from '../reels/reel.constants.js';
import { ReelModel } from '../reels/reel.model.js';
import { reelService, type ReelFeedResult } from '../reels/reel.service.js';
import type { ReelFeedQuery } from '../reels/reel.validation.js';
import { KidsModeModel, type KidsModeDocument } from './kids-mode.model.js';
import { kidsModeRepository, type KidsModeRepository } from './kids-mode.repository.js';
import type {
  AdminKidsModeContentInput,
  AdminKidsModeContentQuery,
  SetupKidsModeInput,
  VerifyKidsPinInput,
} from './kids-mode.validation.js';

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

export interface AdminKidsModeContentItem {
  id: string;
  thumbnailUrl: string;
  uploader: string;
  uploadDate: string;
  kidFriendly: boolean;
  reportCount: number;
}

export interface AdminKidsModeReportItem {
  id: string;
  thumbnailUrl: string;
  reporterCount: number;
  reason: string;
  dateReported: string;
}

export interface AdminKidsModeListResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

  async listAdminContent(query: AdminKidsModeContentQuery): Promise<AdminKidsModeListResult<AdminKidsModeContentItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {
      status: ReelStatus.READY,
      visibility: ReelVisibility.PUBLIC,
      deletedAt: { $exists: false },
    };

    if (query.kidFriendly === 'yes') filter.forKids = true;
    if (query.kidFriendly === 'no') filter.forKids = false;

    const [items, total] = await Promise.all([
      ReelModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('ownerId', 'email profile.displayName profile.username profile.photoUrl')
        .lean()
        .exec(),
      ReelModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map(mapAdminKidsContent),
      pagination: toPagination(page, limit, total),
    };
  }

  async updateAdminContent(reelId: string, input: AdminKidsModeContentInput): Promise<AdminKidsModeContentItem> {
    const reel = await ReelModel.findOneAndUpdate(
      {
        _id: reelId,
        status: ReelStatus.READY,
        visibility: ReelVisibility.PUBLIC,
        deletedAt: { $exists: false },
      },
      { $set: { forKids: input.forKids } },
      { new: true },
    )
      .populate('ownerId', 'email profile.displayName profile.username profile.photoUrl')
      .lean()
      .exec();

    if (!reel) {
      throw new NotFoundError('Kids Mode content was not found.', { code: 'KIDS_CONTENT_NOT_FOUND' });
    }

    return mapAdminKidsContent(reel);
  }

  async listAdminReports(query: AdminKidsModeContentQuery): Promise<AdminKidsModeListResult<AdminKidsModeReportItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = {
      status: ReelStatus.READY,
      visibility: ReelVisibility.PUBLIC,
      deletedAt: { $exists: false },
      reportCount: { $gt: 0 },
    };

    const [items, total] = await Promise.all([
      ReelModel.find(filter)
        .sort({ reportCount: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      ReelModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map(mapAdminKidsReport),
      pagination: toPagination(page, limit, total),
    };
  }

  async removeReportedContent(reelId: string): Promise<{ id: string; kidFriendly: boolean }> {
    const reel = await ReelModel.findOneAndUpdate(
      { _id: reelId, deletedAt: { $exists: false } },
      { $set: { forKids: false } },
      { new: true },
    )
      .select('_id forKids')
      .lean()
      .exec();

    if (!reel) {
      throw new NotFoundError('Reported Kids Mode content was not found.', { code: 'KIDS_CONTENT_NOT_FOUND' });
    }

    return { id: String(reel._id), kidFriendly: Boolean(reel.forKids) };
  }

  async dismissReportedContent(reelId: string): Promise<{ id: string; dismissed: true }> {
    const reel = await ReelModel.findOneAndUpdate(
      { _id: reelId, deletedAt: { $exists: false } },
      { $set: { reportCount: 0 } },
      { new: true },
    )
      .select('_id')
      .lean()
      .exec();

    if (!reel) {
      throw new NotFoundError('Reported Kids Mode content was not found.', { code: 'KIDS_CONTENT_NOT_FOUND' });
    }

    return { id: String(reel._id), dismissed: true };
  }

  async getAdminStats(): Promise<{
    totalKidsModeUsers: number;
    activeKidsProfiles: number;
    ageBreakdown: { range: string; users: number }[];
  }> {
    const [totalKidsModeUsers, activeKidsProfiles, ageGroups] = await Promise.all([
      KidsModeModel.countDocuments().exec(),
      KidsModeModel.countDocuments({ isActive: true }).exec(),
      KidsModeModel.aggregate<{ _id: string; users: number }>([
        { $group: { _id: '$ageGroup', users: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).exec(),
    ]);

    const ageMap = new Map(ageGroups.map((item) => [item._id, item.users]));

    return {
      totalKidsModeUsers,
      activeKidsProfiles,
      ageBreakdown: KidsAgeGroupsForAdmin.map((range) => ({
        range,
        users: ageMap.get(range) ?? 0,
      })),
    };
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

const KidsAgeGroupsForAdmin = ['3-6', '7-9', '10-15'];

function toPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

function mapAdminKidsContent(reel: any): AdminKidsModeContentItem {
  const owner = reel.ownerId;
  return {
    id: String(reel._id),
    thumbnailUrl: getReelThumbnailUrl(reel),
    uploader:
      owner?.profile?.displayName ||
      owner?.profile?.username ||
      owner?.email ||
      'Unknown user',
    uploadDate: formatAdminDate(reel.publishedAt || reel.createdAt),
    kidFriendly: Boolean(reel.forKids),
    reportCount: Number(reel.reportCount ?? 0),
  };
}

function mapAdminKidsReport(reel: any): AdminKidsModeReportItem {
  return {
    id: String(reel._id),
    thumbnailUrl: getReelThumbnailUrl(reel),
    reporterCount: Number(reel.reportCount ?? 0),
    reason: 'Reported for kids review',
    dateReported: formatAdminDate(reel.updatedAt || reel.createdAt),
  };
}

function getReelThumbnailUrl(reel: any): string {
  return (
    reel.thumbnail?.secureUrl ||
    reel.processedMedia?.secureUrl ||
    reel.rawMedia?.secureUrl ||
    ''
  );
}

function formatAdminDate(value?: Date | string): string {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
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
