import { Types } from 'mongoose';

import {
  AdCampaignModel,
  type AdCampaignDocument,
  type AdCampaignStatus,
} from './ad-campaign.model.js';
import { AdEventModel, type AdEventType } from './ad-event.model.js';
import type { CreateAdCampaignInput, ListAdsQuery } from './ad.validation.js';

export type AdMetricActor = {
  userId?: string;
  anonymousKey?: string;
};

export type AdMetricResult = {
  recorded: boolean;
  duplicate: boolean;
  completed: boolean;
  spendUsd: number;
};

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
      'ctaType',
      'ctaLabel',
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

  async recordMetric(
    adId: string,
    type: AdEventType,
    actor: AdMetricActor,
  ): Promise<AdMetricResult> {
    const ad = await AdCampaignModel.findOne({
      _id: adId,
      status: 'active',
      placement: 'feed',
      $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: new Date() } }],
      $and: [{ $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: new Date() } }] }],
    }).exec();

    if (!ad) {
      return { recorded: false, duplicate: false, completed: false, spendUsd: 0 };
    }

    const eventPayload = {
      adId: ad._id,
      type,
      ...(actor.userId ? { userId: new Types.ObjectId(actor.userId) } : {}),
      ...(actor.anonymousKey ? { anonymousKey: actor.anonymousKey } : {}),
    };

    try {
      await AdEventModel.create(eventPayload);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return { recorded: false, duplicate: true, completed: ad.status === 'completed', spendUsd: 0 };
      }
      throw error;
    }

    if (type === 'click') {
      await AdCampaignModel.updateOne({ _id: ad._id }, { $inc: { 'metrics.clicks': 1 } }).exec();
      return { recorded: true, duplicate: false, completed: false, spendUsd: 0 };
    }

    const currentSpend = ad.metrics?.spendUsd || 0;
    const perImpressionSpend = ad.targetUsers > 0 ? ad.budgetUsd / ad.targetUsers : 0;
    const spendUsd = Math.max(0, Math.min(perImpressionSpend, ad.budgetUsd - currentSpend));
    const nextImpressions = (ad.metrics?.impressions || 0) + 1;
    const nextSpend = currentSpend + spendUsd;
    const completed = nextImpressions >= ad.targetUsers || nextSpend >= ad.budgetUsd;

    await AdCampaignModel.updateOne(
      { _id: ad._id },
      {
        $inc: {
          'metrics.impressions': 1,
          'metrics.spendUsd': spendUsd,
        },
        ...(completed ? { $set: { status: 'completed' } } : {}),
      },
    ).exec();

    return { recorded: true, duplicate: false, completed, spendUsd };
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

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: number }).code === 11000;
}

function targetUsersFromBudget(budgetUsd: number): number {
  if (budgetUsd >= 500) return 10000;
  if (budgetUsd >= 200) return 500;
  return 100;
}
