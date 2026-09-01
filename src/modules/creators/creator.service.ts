import { Types } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { CreatorEarningModel } from '../monetization/creator-earning.model.js';
import { CreatorRequirementSettingModel } from './creator-requirement-setting.model.js';
import { creatorRepository, type CreatorRepository } from './creator.repository.js';
import { adminNotificationService } from '../notifications/admin-notification.service.js';
import { ReelModel } from '../reels/reel.model.js';
import { ReelStatus, ReelVisibility } from '../reels/reel.constants.js';
import { FollowModel } from '../users/follow.model.js';
import type {
  CreatorApplicationSummaryDTO,
  CreatorEligibilityDTO,
  CreatorRequirementDTO,
} from './creator.types.js';
import type {
  AdminListCreatorApplicationsQuery,
  CreateCreatorApplicationInput,
  CreatorAnalyticsQuery,
} from './creator.validation.js';

export class CreatorService {
  constructor(private readonly repository: CreatorRepository = creatorRepository) {}

  async getMyEligibility(userId: string): Promise<CreatorEligibilityDTO> {
    const [user, followersCount, reelStats, application, requirementSettings] = await Promise.all([
      this.repository.findUser(userId),
      this.repository.countFollowers(userId),
      this.repository.getReelStats(userId),
      this.repository.findLatestApplication(userId),
      getCreatorRequirementSettings(),
    ]);

    if (!user) {
      throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    }

    const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000);
    const profileComplete = Boolean(
      user.profile?.isSetupComplete &&
        user.profile?.displayName &&
        user.profile?.username &&
        user.profile?.photoUrl,
    );

    const allRequirements: CreatorRequirementDTO[] = [
      {
        key: 'profile',
        title: 'Profile Complete',
        current: profileComplete ? 1 : 0,
        target: 1,
        complete: profileComplete,
        enabled: requirementSettings.profileEnabled,
      },
      {
        key: 'followers',
        title: 'Followers',
        current: followersCount,
        target: requirementSettings.followers,
        complete: followersCount >= requirementSettings.followers,
        enabled: requirementSettings.followersEnabled,
      },
      {
        key: 'views',
        title: 'Video Views',
        current: reelStats.totalViews,
        target: requirementSettings.views,
        complete: reelStats.totalViews >= requirementSettings.views,
        enabled: requirementSettings.viewsEnabled,
      },
      {
        key: 'watch_time',
        title: 'Watch Time',
        current: reelStats.watchTimeMinutes,
        target: requirementSettings.watchTimeMinutes,
        complete: reelStats.watchTimeMinutes >= requirementSettings.watchTimeMinutes,
        enabled: requirementSettings.watchTimeEnabled,
      },
      {
        key: 'likes',
        title: 'Likes',
        current: reelStats.totalLikes,
        target: requirementSettings.likes,
        complete: reelStats.totalLikes >= requirementSettings.likes,
        enabled: requirementSettings.likesEnabled,
      },
      {
        key: 'account_age',
        title: 'Account Age',
        current: accountAgeDays,
        target: requirementSettings.accountAgeDays,
        complete: accountAgeDays >= requirementSettings.accountAgeDays,
        enabled: requirementSettings.accountAgeEnabled,
      },
      {
        key: 'reels',
        title: 'Reels Posted',
        current: reelStats.reelsCount,
        target: requirementSettings.reels,
        complete: reelStats.reelsCount >= requirementSettings.reels,
        enabled: requirementSettings.reelsEnabled,
      },
      {
        key: 'guidelines',
        title: 'Community Guidelines',
        current: reelStats.totalReports,
        target: requirementSettings.reportLimit,
        complete: reelStats.totalReports <= requirementSettings.reportLimit,
        locked: reelStats.totalReports > requirementSettings.reportLimit,
        enabled: requirementSettings.guidelinesEnabled,
      },
    ];
    const requirements = allRequirements.filter((item) => item.enabled !== false);

    const completedSteps = requirements.filter((item) => item.complete).length;
    const totalSteps = requirements.length;
    const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 100;
    const isCreator = user.role === UserRole.CREATOR;
    const canApply = completedSteps === totalSteps && !['pending', 'held', 'approved'].includes(application?.status ?? '');

    return {
      status: isCreator ? 'approved' : application?.status ?? (canApply ? 'eligible' : 'not_started'),
      progress,
      completedSteps,
      totalSteps,
      canApply,
      isCreator,
      ...(application ? { application: mapApplicationSummary(application) } : {}),
      requirements,
    };
  }

  async createApplication(userId: string, input: CreateCreatorApplicationInput) {
    const eligibility = await this.getMyEligibility(userId);

    if (!eligibility.canApply) {
      throw new AppError('Creator requirements are not complete yet.', 409, {
        code: 'CREATOR_NOT_ELIGIBLE',
      });
    }

    const application = await this.repository.createApplication(userId, input);
    void adminNotificationService.notifyAdmins({
      event: 'creator_application_submitted',
      title: 'New creator application',
      body: `${input.fullName || input.email || 'A user'} submitted a creator application for review.`,
      relatedEntityId: application._id.toString(),
    });
    return mapApplicationSummary(application);
  }

  async listApplications(query: AdminListCreatorApplicationsQuery) {
    const items = await this.repository.listApplications(query);
    return { items: items.map(mapAdminApplication) };
  }

  async reviewApplication(id: string, reviewerId: string, action: 'approve' | 'reject' | 'hold', reason?: string) {
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'held';
    const application = await this.repository.updateApplicationStatus(id, status, reviewerId, reason);

    if (!application) {
      throw new NotFoundError('Creator application was not found.', {
        code: 'CREATOR_APPLICATION_NOT_FOUND',
      });
    }

    if (status === 'approved') {
      await this.repository.markUserAsCreator(application.userId.toString());
    }

    return mapApplicationSummary(application);
  }

  async getAnalytics(userId: string, query: CreatorAnalyticsQuery) {
    const userObjectId = new Types.ObjectId(userId);
    const days = rangeToDays(query.range);
    const since = startOfDay(daysAgo(days - 1));
    const publicReadyFilter = {
      ownerId: userObjectId,
      status: ReelStatus.READY,
      visibility: ReelVisibility.PUBLIC,
      deletedAt: { $exists: false },
    };

    const [summaryRows, followers, newFollowers, earningsRows, trendRows, topReels] = await Promise.all([
      ReelModel.aggregate<{
        reels: number;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
      }>([
        { $match: publicReadyFilter },
        {
          $group: {
            _id: null,
            reels: { $sum: 1 },
            views: { $sum: '$viewCount' },
            likes: { $sum: '$likeCount' },
            comments: { $sum: '$commentCount' },
            shares: { $sum: '$shareCount' },
            saves: { $sum: '$saveCount' },
          },
        },
      ]).exec(),
      FollowModel.countDocuments({ followingId: userObjectId }).exec(),
      FollowModel.countDocuments({ followingId: userObjectId, createdAt: { $gte: since } }).exec(),
      CreatorEarningModel.aggregate<{ total: number; pending: number; available: number }>([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: null,
            total: { $sum: '$amountUsd' },
            pending: {
              $sum: {
                $cond: [{ $in: ['$status', ['pending', 'held']] }, '$amountUsd', 0],
              },
            },
            available: {
              $sum: {
                $cond: [{ $eq: ['$status', 'available'] }, '$amountUsd', 0],
              },
            },
          },
        },
      ]).exec(),
      ReelModel.aggregate<{ _id: string; views: number; likes: number; comments: number; shares: number; saves: number }>([
        { $match: { ...publicReadyFilter, publishedAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$publishedAt' } },
            views: { $sum: '$viewCount' },
            likes: { $sum: '$likeCount' },
            comments: { $sum: '$commentCount' },
            shares: { $sum: '$shareCount' },
            saves: { $sum: '$saveCount' },
          },
        },
        { $sort: { _id: 1 } },
      ]).exec(),
      ReelModel.find(publicReadyFilter)
        .sort({ viewCount: -1, likeCount: -1, publishedAt: -1 })
        .limit(5)
        .select('caption viewCount likeCount commentCount shareCount saveCount thumbnail processedMedia rawMedia publishedAt')
        .lean()
        .exec(),
    ]);

    const summary = summaryRows[0] ?? { reels: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    const earnings = earningsRows[0] ?? { total: 0, pending: 0, available: 0 };
    const engagementTotal = summary.likes + summary.comments + summary.shares + summary.saves;
    const engagementRate = summary.views > 0 ? Number(((engagementTotal / summary.views) * 100).toFixed(1)) : 0;
    const trendMap = new Map(trendRows.map((row) => [row._id, row]));

    return {
      range: query.range,
      summary: {
        reels: summary.reels,
        views: summary.views,
        likes: summary.likes,
        comments: summary.comments,
        shares: summary.shares,
        saves: summary.saves,
        followers,
        newFollowers,
        engagementRate,
        earningsUsd: roundMoney(earnings.total),
        pendingEarningsUsd: roundMoney(earnings.pending),
        availableEarningsUsd: roundMoney(earnings.available),
      },
      trend: buildDateBuckets(days).map((date) => ({
        date,
        views: trendMap.get(date)?.views ?? 0,
        likes: trendMap.get(date)?.likes ?? 0,
        comments: trendMap.get(date)?.comments ?? 0,
        shares: trendMap.get(date)?.shares ?? 0,
        saves: trendMap.get(date)?.saves ?? 0,
      })),
      topReels: topReels.map((reel) => ({
        id: reel._id.toString(),
        title: reel.caption || 'Untitled reel',
        thumbnailUrl: reel.thumbnail?.secureUrl || reel.processedMedia?.secureUrl || reel.rawMedia?.secureUrl,
        views: reel.viewCount || 0,
        likes: reel.likeCount || 0,
        comments: reel.commentCount || 0,
        shares: reel.shareCount || 0,
        saves: reel.saveCount || 0,
        publishedAt: reel.publishedAt?.toISOString?.() ?? null,
      })),
    };
  }
}

export const creatorService = new CreatorService();

async function getCreatorRequirementSettings() {
  let setting = await CreatorRequirementSettingModel.findOne().lean().exec();
  if (!setting) {
    setting = await CreatorRequirementSettingModel.create({});
  }

  return {
    profileEnabled: setting.profileEnabled ?? true,
    followers: setting.followers,
    followersEnabled: setting.followersEnabled ?? true,
    views: setting.views,
    viewsEnabled: setting.viewsEnabled ?? true,
    watchTimeMinutes: setting.watchTimeMinutes,
    watchTimeEnabled: setting.watchTimeEnabled ?? false,
    likes: setting.likes,
    likesEnabled: setting.likesEnabled ?? false,
    accountAgeDays: setting.accountAgeDays,
    accountAgeEnabled: setting.accountAgeEnabled ?? true,
    reels: setting.reels,
    reelsEnabled: setting.reelsEnabled ?? false,
    reportLimit: setting.reportLimit,
    guidelinesEnabled: setting.guidelinesEnabled ?? true,
  };
}

function mapApplicationSummary(application: any): CreatorApplicationSummaryDTO {
  return {
    id: application._id.toString(),
    status: application.status,
    ...(application.adminReason ? { adminReason: application.adminReason } : {}),
    ...(application.reviewedAt ? { reviewedAt: application.reviewedAt.toISOString() } : {}),
    createdAt: application.createdAt.toISOString(),
  };
}

function mapAdminApplication(application: any) {
  const user = application.userId;
  return {
    ...mapApplicationSummary(application),
    fullName: application.fullName,
    email: application.email,
    ...(application.dateOfBirth ? { dateOfBirth: application.dateOfBirth.toISOString().slice(0, 10) } : {}),
    ...(application.occupation ? { occupation: application.occupation } : {}),
    ...(application.occupationId
      ? {
          occupationData: {
            id: application.occupationId?._id?.toString?.() || application.occupationId.toString(),
            name: application.occupationId?.name || application.occupation,
          },
        }
      : {}),
    contentCategory: application.contentCategory,
    ...(application.contentCategoryId
      ? {
          contentCategoryData: {
            id: application.contentCategoryId?._id?.toString?.() || application.contentCategoryId.toString(),
            name: application.contentCategoryId?.name || application.contentCategory,
          },
        }
      : {}),
    contentLanguage: application.contentLanguage,
    country: application.country,
    reason: application.reason,
    ...(application.idFrontUrl ? { idFrontUrl: application.idFrontUrl } : {}),
    ...(application.idBackUrl ? { idBackUrl: application.idBackUrl } : {}),
    ...(application.adminReason ? { adminReason: application.adminReason } : {}),
    ...(application.reviewedAt ? { reviewedAt: application.reviewedAt.toISOString() } : {}),
    user: {
      id: user?._id?.toString() || application.userId.toString(),
      email: user?.email,
      role: user?.role,
      profile: user?.profile,
    },
    ...(application.reviewedBy
      ? {
          reviewedBy: {
            id: application.reviewedBy?._id?.toString(),
            email: application.reviewedBy?.email,
            profile: application.reviewedBy?.profile,
          },
        }
      : {}),
  };
}

function rangeToDays(range: string) {
  if (range === '28d') return 28;
  if (range === '60d') return 60;
  if (range === '90d') return 90;
  return 7;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildDateBuckets(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = startOfDay(daysAgo(days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}
