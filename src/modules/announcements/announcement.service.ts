import { NotFoundError } from '../../common/errors/not-found-error.js';
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

  async listActive() {
    await this.syncTimedStatuses();

    return cacheService.getOrSet(cacheKeys.activeAnnouncements, ACTIVE_ANNOUNCEMENT_CACHE_TTL_SECONDS, async () => {
      const items = await announcementRepository.findActiveForUser();
      return items.map(mapAnnouncement);
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
