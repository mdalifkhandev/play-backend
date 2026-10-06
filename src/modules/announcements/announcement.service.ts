import { NotFoundError } from '../../common/errors/not-found-error.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { UserModel } from '../users/user.model.js';
import { announcementRepository } from './announcement.repository.js';
import type { AnnouncementDocument } from './announcement.model.js';
import type {
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  UpdateAnnouncementInput,
} from './announcement.validation.js';
import { cacheKeyPrefixes, cacheKeys } from '../../infrastructure/cache/cache-keys.js';
import { cacheService } from '../../infrastructure/cache/cache.service.js';

const ACTIVE_ANNOUNCEMENT_CACHE_TTL_SECONDS = 30;

export class AnnouncementService {
  async listAdmin(query: ListAnnouncementsQuery) {
    await this.syncTimedStatuses();

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const { items, total } = await announcementRepository.list(skip, limit, query.status);

    return {
      items: items.map(mapAnnouncement),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listActive(userId?: string) {
    await this.syncTimedStatuses();

    const items = await cacheService.getOrSet(cacheKeys.activeAnnouncements, ACTIVE_ANNOUNCEMENT_CACHE_TTL_SECONDS, async () => {
      const items = await announcementRepository.findActiveForUser();
      return items.map(mapAnnouncement);
    });

    const audience = await this.resolveAudience(userId);
    return items.filter((item) => {
      if (item.placement === 'maintenance' || item.audience === 'all') return true;
      if (item.audience === 'creators') return audience.isCreator;
      if (item.audience === 'premium') return audience.isPremium;
      return false;
    });
  }

  async create(adminUserId: string, input: CreateAnnouncementInput) {
    const item = await announcementRepository.create({ ...input, createdBy: adminUserId });
    await cacheService.deleteByPrefix(cacheKeyPrefixes.announcements);
    return mapAnnouncement(item);
  }

  async update(adminUserId: string, announcementId: string, input: UpdateAnnouncementInput) {
    const item = await announcementRepository.update(announcementId, { ...input, updatedBy: adminUserId });
    if (!item) {
      throw new NotFoundError('Announcement was not found.');
    }

    await cacheService.deleteByPrefix(cacheKeyPrefixes.announcements);

    return mapAnnouncement(item);
  }

  async delete(announcementId: string) {
    const item = await announcementRepository.delete(announcementId);
    if (!item) {
      throw new NotFoundError('Announcement was not found.');
    }

    await cacheService.deleteByPrefix(cacheKeyPrefixes.announcements);

    return {
      deleted: true,
      id: item._id.toString(),
    };
  }

  async syncTimedStatuses() {
    const result = await announcementRepository.syncTimedStatuses();
    if (result.activated > 0 || result.expired > 0) {
      await cacheService.deleteByPrefix(cacheKeyPrefixes.announcements);
    }
    return result;
  }

  private async resolveAudience(userId?: string) {
    if (!userId) return { isCreator: false, isPremium: false };

    const user = await UserModel.findById(userId)
      .select('role currentSubscriptionId')
      .populate('currentSubscriptionId', 'planId interval status expiresAt')
      .lean()
      .exec();

    const subscription = user?.currentSubscriptionId as {
      planId?: string;
      interval?: string;
      status?: string;
      expiresAt?: Date;
    } | undefined;

    return {
      isCreator: user?.role === UserRole.CREATOR,
      isPremium: isActivePremiumSubscription(subscription),
    };
  }
}

function mapAnnouncement(item: AnnouncementDocument) {
  return {
    id: item._id.toString(),
    title: item.title,
    message: item.message,
    audience: item.audience,
    placement: item.placement,
    status: item.status,
    priority: item.priority,
    startsAt: item.startsAt?.toISOString(),
    endsAt: item.endsAt?.toISOString(),
    scheduledFor: item.scheduledFor?.toISOString(),
    sentAt: item.sentAt?.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export const announcementService = new AnnouncementService();

function isActivePremiumSubscription(subscription?: {
  planId?: string;
  interval?: string;
  status?: string;
  expiresAt?: Date;
}) {
  if (!subscription || subscription.status !== 'active') return false;
  if (subscription.interval === 'lifetime' || subscription.planId?.toLowerCase().includes('lifetime')) {
    return true;
  }
  return Boolean(subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now());
}
