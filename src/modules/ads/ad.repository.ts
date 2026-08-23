import type { Types } from 'mongoose';

import {
  AdCampaignModel,
  type AdCampaignDocument,
  type AdCampaignStatus,
} from './ad-campaign.model.js';
import type { CreateAdCampaignInput, ListAdsQuery } from './ad.validation.js';

export class AdRepository {
  async create(ownerId: string, input: CreateAdCampaignInput): Promise<AdCampaignDocument> {
    const budgetUsd = input.budgetUsd;
    const targetUsers = input.targetUsers || targetUsersFromBudget(budgetUsd);

    const payload = {
      ownerId,
      category: input.category,
      days: input.days,
      budgetUsd,
      targetUsers,
      placement: input.placement,
      audienceType: input.audienceType,
      areaType: input.areaType,
      status: 'pending',
      metrics: { impressions: 0, clicks: 0, spendUsd: 0 },
    } as Record<string, unknown>;

    for (const key of [
      'city',
      'country',
      'mediaAssetId',
      'mediaKey',
      'mediaUrl',
      'title',
      'description',
      'destinationUrl',
    ] as const) {
      if (input[key] !== undefined) {
        payload[key] = input[key];
      }
    }

    return AdCampaignModel.create(payload);
  }

  async findMine(userId: string, adId: string): Promise<AdCampaignDocument | null> {
    return AdCampaignModel.findOne({ _id: adId, ownerId: userId }).exec();
  }

  async findById(adId: string): Promise<AdCampaignDocument | null> {
    return AdCampaignModel.findById(adId)
      .populate('ownerId', 'email profile.username profile.displayName profile.photoUrl')
      .exec();
  }

  async listMine(userId: string, query: ListAdsQuery): Promise<AdCampaignDocument[]> {
    return this.list({ ownerId: userId, query });
  }

  async listForAdmin(query: ListAdsQuery): Promise<AdCampaignDocument[]> {
    return this.list({ query, includeOwner: true });
  }

  async listActiveForFeed(limit: number): Promise<AdCampaignDocument[]> {
    const now = new Date();

    return AdCampaignModel.find({
      status: 'active',
      placement: 'feed',
      $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }],
      $and: [
        {
          $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: now } }],
        },
      ],
    })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .exec();
  }

  async incrementMetric(adId: string, metric: 'impressions' | 'clicks'): Promise<void> {
    await AdCampaignModel.updateOne(
      { _id: adId },
      { $inc: { [`metrics.${metric}`]: 1 } },
    ).exec();
  }

  async updateStatus(
    adId: string,
    update: {
      status: AdCampaignStatus;
      adminReason?: string;
      reviewedBy?: string | Types.ObjectId;
      reviewedAt?: Date;
      startsAt?: Date;
      endsAt?: Date;
      pausedAt?: Date;
      heldAt?: Date;
    },
  ): Promise<AdCampaignDocument | null> {
    return AdCampaignModel.findByIdAndUpdate(
      adId,
      { $set: update },
      { new: true, runValidators: true },
    ).exec();
  }

  private async list({
    ownerId,
    query,
    includeOwner,
  }: {
    ownerId?: string;
    query: ListAdsQuery;
    includeOwner?: boolean;
  }): Promise<AdCampaignDocument[]> {
    const filter: Record<string, unknown> = {
      ...(ownerId ? { ownerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.cursor ? { createdAt: { $lt: new Date(query.cursor) } } : {}),
    };

    const request = AdCampaignModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit + 1);

    if (includeOwner) {
      request.populate('ownerId', 'email profile.username profile.displayName profile.photoUrl');
    }

    return request.exec();
  }
}

export const adRepository = new AdRepository();

function targetUsersFromBudget(budgetUsd: number): number {
  if (budgetUsd >= 500) return 10000;
  if (budgetUsd >= 200) return 500;
  return 100;
}
