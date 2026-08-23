import { AppError } from '../../common/errors/app-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { CreatorRequirementSettingModel } from './creator-requirement-setting.model.js';
import { creatorRepository, type CreatorRepository } from './creator.repository.js';
import type {
  CreatorApplicationSummaryDTO,
  CreatorEligibilityDTO,
  CreatorRequirementDTO,
} from './creator.types.js';
import type {
  AdminListCreatorApplicationsQuery,
  CreateCreatorApplicationInput,
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
    const progress = Math.round((completedSteps / totalSteps) * 100);
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
    contentCategory: application.contentCategory,
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
