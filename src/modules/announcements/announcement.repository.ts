import { Types } from 'mongoose';

import { AnnouncementModel, type AnnouncementDocument } from './announcement.model.js';
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from './announcement.validation.js';

export class AnnouncementRepository {
  async create(data: CreateAnnouncementInput & { createdBy: string }): Promise<AnnouncementDocument> {
    const isScheduled = Boolean(data.schedule && data.scheduledFor);
    const payload: Record<string, unknown> = {
      title: data.title,
      message: data.message,
      audience: data.audience,
      placement: data.placement,
      priority: data.priority,
      status: isScheduled ? 'scheduled' : 'active',
      createdBy: new Types.ObjectId(data.createdBy),
    };

    if (isScheduled) {
      payload.scheduledFor = data.scheduledFor;
    } else {
      payload.sentAt = new Date();
    }

    if (data.startsAt) {
      payload.startsAt = data.startsAt;
    }

    if (data.endsAt) {
      payload.endsAt = data.endsAt;
    }

    return AnnouncementModel.create(payload);
  }

  async list(
    skip: number,
    limit: number,
    status?: string,
  ): Promise<{ items: AnnouncementDocument[]; total: number }> {
    const query: Record<string, unknown> = status ? { status } : {};
    const [items, total] = await Promise.all([
      AnnouncementModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      AnnouncementModel.countDocuments(query),
    ]);

    return { items, total };
  }

  async findActiveForUser(): Promise<AnnouncementDocument[]> {
    const now = new Date();
    return AnnouncementModel.find({
      $or: [
        { status: 'active' },
        { status: 'scheduled', scheduledFor: { $lte: now } },
      ],
      $and: [
        { $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: now } }] },
      ],
    })
      .sort({ priority: -1, createdAt: -1 })
      .limit(10)
      .exec();
  }

  async syncTimedStatuses(now = new Date()): Promise<{ activated: number; expired: number }> {
    const [activateResult, expireResult] = await Promise.all([
      AnnouncementModel.updateMany(
        {
          status: 'scheduled',
          $or: [
            { scheduledFor: { $lte: now } },
            { startsAt: { $lte: now } },
          ],
          $and: [
            { $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: now } }] },
          ],
        },
        {
          $set: {
            status: 'active',
            sentAt: now,
          },
        },
      ).exec(),
      AnnouncementModel.updateMany(
        {
          status: { $in: ['scheduled', 'active'] },
          endsAt: { $lte: now },
        },
        {
          $set: {
            status: 'expired',
          },
        },
      ).exec(),
    ]);

    return {
      activated: activateResult.modifiedCount,
      expired: expireResult.modifiedCount,
    };
  }

  async update(
    announcementId: string,
    data: UpdateAnnouncementInput & { updatedBy: string },
  ): Promise<AnnouncementDocument | null> {
    if (!Types.ObjectId.isValid(announcementId)) {
      return null;
    }

    const update: Record<string, unknown> = {
      ...data,
      updatedBy: new Types.ObjectId(data.updatedBy),
    };

    if (data.status === 'active') {
      update.sentAt = new Date();
    }

    if (data.scheduledFor === null || data.startsAt === null || data.endsAt === null) {
      const unset: Record<string, string> = {};
      if (data.scheduledFor === null) unset.scheduledFor = '';
      if (data.startsAt === null) unset.startsAt = '';
      if (data.endsAt === null) unset.endsAt = '';
      delete update.scheduledFor;
      delete update.startsAt;
      delete update.endsAt;
      return AnnouncementModel.findByIdAndUpdate(
        announcementId,
        { $set: update, $unset: unset },
        { new: true },
      ).exec();
    }

    return AnnouncementModel.findByIdAndUpdate(announcementId, { $set: update }, { new: true }).exec();
  }

  async delete(announcementId: string): Promise<AnnouncementDocument | null> {
    if (!Types.ObjectId.isValid(announcementId)) {
      return null;
    }
    return AnnouncementModel.findByIdAndDelete(announcementId).exec();
  }
}

export const announcementRepository = new AnnouncementRepository();
