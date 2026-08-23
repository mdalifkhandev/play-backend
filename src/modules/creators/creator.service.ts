import { AppError } from '../../common/errors/app-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
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

const CREATOR_REQUIREMENTS = Object.freeze({
  followers: 1000,
  views: 100_000,
  watchTimeMinutes: 1_000,
  likes: 10_000,
  accountAgeDays: 30,
  reels: 3,
  reportLimit: 0,
});

export class CreatorService {
  constructor(private readonly repository: CreatorRepository = creatorRepository) {}

  async getMyEligibility(userId: string): Promise<CreatorEligibilityDTO> {
    const [user, followersCount, reelStats, application] = await Promise.all([
      this.repository.findUser(userId),
      this.repository.countFollowers(userId),
      this.repository.getReelStats(userId),
      this.repository.findLatestApplication(userId),
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

    const requirements: CreatorRequirementDTO[] = [
      {
        key: 'profile',
        title: 'Profile Complete',
        current: profileComplete ? 1 : 0,
        target: 1,
        complete: profileComplete,
      },
      {
        key: 'followers',
        title: 'Followers',
        current: followersCount,
        target: CREATOR_REQUIREMENTS.followers,
        complete: followersCount >= CREATOR_REQUIREMENTS.followers,
      },
      {
        key: 'views',
        title: 'Video Views',
        current: reelStats.totalViews,
        target: CREATOR_REQUIREMENTS.views,
        complete: reelStats.totalViews >= CREATOR_REQUIREMENTS.views,
      },
      {
        key: 'account_age',
        title: 'Account Age',
        current: accountAgeDays,
        target: CREATOR_REQUIREMENTS.accountAgeDays,
        complete: accountAgeDays >= CREATOR_REQUIREMENTS.accountAgeDays,
      },
      {
        key: 'guidelines',
        title: 'Community Guidelines',
        current: Math.max(0, CREATOR_REQUIREMENTS.reportLimit - reelStats.totalReports),
        target: 1,
        complete: reelStats.totalReports <= CREATOR_REQUIREMENTS.reportLimit,
        locked: reelStats.totalReports > CREATOR_REQUIREMENTS.reportLimit,
      },
    ];

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
