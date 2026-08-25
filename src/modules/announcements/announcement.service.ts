import { NotFoundError } from '../../common/errors/not-found-error.js';
import { announcementRepository } from './announcement.repository.js';
import type { AnnouncementDocument } from './announcement.model.js';
import type {
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  UpdateAnnouncementInput,
} from './announcement.validation.js';

export class AnnouncementService {
  async listAdmin(query: ListAnnouncementsQuery) {
    await announcementRepository.syncTimedStatuses();

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
    await announcementRepository.syncTimedStatuses();

    const items = await announcementRepository.findActiveForUser();
    return items.map(mapAnnouncement);
  }

  async create(adminUserId: string, input: CreateAnnouncementInput) {
    const item = await announcementRepository.create({ ...input, createdBy: adminUserId });
    return mapAnnouncement(item);
  }

  async update(adminUserId: string, announcementId: string, input: UpdateAnnouncementInput) {
    const item = await announcementRepository.update(announcementId, { ...input, updatedBy: adminUserId });
    if (!item) {
      throw new NotFoundError('Announcement was not found.');
    }

    return mapAnnouncement(item);
  }

  async delete(announcementId: string) {
    const item = await announcementRepository.delete(announcementId);
    if (!item) {
      throw new NotFoundError('Announcement was not found.');
    }

    return {
      deleted: true,
      id: item._id.toString(),
    };
  }

  async syncTimedStatuses() {
    return announcementRepository.syncTimedStatuses();
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
