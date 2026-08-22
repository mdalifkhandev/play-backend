import { AppError } from '../../common/errors/app-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import {
  adRepository,
  type AdRepository,
} from './ad.repository.js';
import type { AdCampaignDocument, AdCampaignStatus } from './ad-campaign.model.js';
import type {
  AdFeedQuery,
  AdminAdActionInput,
  CreateAdCampaignInput,
  ListAdsQuery,
} from './ad.validation.js';

type AdAction = 'approve' | 'reject' | 'hold' | 'pause' | 'resume' | 'cancel';
type AdStatusUpdate = {
  status: AdCampaignStatus;
  adminReason?: string;
  startsAt?: Date;
  endsAt?: Date;
  pausedAt?: Date;
  heldAt?: Date;
};

export class AdService {
  constructor(private readonly ads: AdRepository = adRepository) {}

  async create(ownerId: string, input: CreateAdCampaignInput) {
    const ad = await this.ads.create(ownerId, input);
    return mapAd(ad);
  }

  async listMine(userId: string, query: ListAdsQuery) {
    const items = await this.ads.listMine(userId, query);
    return mapAdPage(items, query.limit);
  }

  async getMine(userId: string, adId: string) {
    const ad = await this.ads.findMine(userId, adId);
    if (!ad) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }
    return mapAd(ad);
  }

  async getFeed(query: AdFeedQuery) {
    const items = await this.ads.listActiveForFeed(query.limit);
    return {
      items: items.map(mapAd),
    };
  }

  async recordImpression(adId: string) {
    await this.requireAd(adId);
    await this.ads.incrementMetric(adId, 'impressions');
    return { recorded: true };
  }

  async recordClick(adId: string) {
    await this.requireAd(adId);
    await this.ads.incrementMetric(adId, 'clicks');
    return { recorded: true };
  }

  async listForAdmin(query: ListAdsQuery) {
    const items = await this.ads.listForAdmin(query);
    return mapAdPage(items, query.limit);
  }

  async getForAdmin(adId: string) {
    const ad = await this.requireAd(adId);
    return mapAd(ad);
  }

  async adminAction(
    adminId: string,
    adId: string,
    action: AdAction,
    input: AdminAdActionInput,
  ) {
    const ad = await this.requireAd(adId);
    const now = new Date();
    const update = transition(ad.status, action, input.reason, ad.days, now);

    const updated = await this.ads.updateStatus(adId, {
      ...update,
      reviewedBy: adminId,
      reviewedAt: now,
    });

    if (!updated) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }

    return mapAd(updated);
  }

  async pauseMine(userId: string, adId: string) {
    const ad = await this.ads.findMine(userId, adId);
    if (!ad) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }

    if (!['approved', 'active', 'paused'].includes(ad.status)) {
      throw new AppError('This ad campaign cannot be paused.', 409, {
        code: 'AD_STATUS_NOT_PAUSABLE',
      });
    }

    const updated = await this.ads.updateStatus(adId, {
      status: 'paused',
      pausedAt: new Date(),
    });

    return mapAd(updated ?? ad);
  }

  async resumeMine(userId: string, adId: string) {
    const ad = await this.ads.findMine(userId, adId);
    if (!ad) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }

    if (ad.status !== 'paused') {
      throw new AppError('Only paused campaigns can be resumed.', 409, {
        code: 'AD_STATUS_NOT_RESUMABLE',
      });
    }

    const updated = await this.ads.updateStatus(adId, {
      status: ad.startsAt && ad.startsAt <= new Date() ? 'active' : 'approved',
    });

    return mapAd(updated ?? ad);
  }

  private async requireAd(adId: string): Promise<AdCampaignDocument> {
    const ad = await this.ads.findById(adId);
    if (!ad) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }
    return ad;
  }
}

export const adService = new AdService();

function transition(
  currentStatus: AdCampaignStatus,
  action: AdAction,
  reason: string | undefined,
  days: number,
  now: Date,
): AdStatusUpdate {
  if (action === 'approve') {
    assertStatus(currentStatus, ['pending', 'held', 'rejected'], action);
    return withReason({
      status: 'active',
      startsAt: now,
      endsAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
    }, reason);
  }

  if (action === 'reject') {
    assertStatus(currentStatus, ['pending', 'held', 'approved', 'active', 'paused'], action);
    return withReason({ status: 'rejected' }, reason);
  }

  if (action === 'hold') {
    assertStatus(currentStatus, ['pending', 'approved', 'active', 'paused'], action);
    return withReason({ status: 'held', heldAt: now }, reason);
  }

  if (action === 'pause') {
    assertStatus(currentStatus, ['approved', 'active'], action);
    return withReason({ status: 'paused', pausedAt: now }, reason);
  }

  if (action === 'resume') {
    assertStatus(currentStatus, ['paused', 'held'], action);
    return withReason({
      status: 'active',
      startsAt: now,
    }, reason);
  }

  if (action === 'cancel') {
    assertStatus(currentStatus, ['pending', 'approved', 'active', 'paused', 'held'], action);
    return withReason({ status: 'cancelled' }, reason);
  }

  throw new AppError('Unsupported ad action.', 400, { code: 'AD_ACTION_INVALID' });
}

function withReason(update: AdStatusUpdate, reason?: string): AdStatusUpdate {
  return reason ? { ...update, adminReason: reason } : update;
}

function assertStatus(
  currentStatus: AdCampaignStatus,
  allowed: AdCampaignStatus[],
  action: AdAction,
) {
  if (!allowed.includes(currentStatus)) {
    throw new AppError(`Cannot ${action} an ad with status ${currentStatus}.`, 409, {
      code: 'AD_STATUS_TRANSITION_INVALID',
    });
  }
}

function mapAdPage(items: AdCampaignDocument[], limit: number) {
  const page = items.length > limit ? items.slice(0, limit) : items;
  const next = items.length > limit ? page.at(-1) : null;

  return {
    items: page.map(mapAd),
    nextCursor: next ? next.createdAt.toISOString() : null,
  };
}

function mapAd(ad: AdCampaignDocument) {
  return {
    id: ad._id.toString(),
    ownerId: ad.ownerId.toString(),
    category: ad.category,
    days: ad.days,
    budgetUsd: ad.budgetUsd,
    targetUsers: ad.targetUsers,
    placement: ad.placement,
    audienceType: ad.audienceType,
    areaType: ad.areaType,
    city: ad.city ?? null,
    country: ad.country ?? null,
    mediaAssetId: ad.mediaAssetId?.toString() ?? null,
    mediaKey: ad.mediaKey ?? null,
    mediaUrl: ad.mediaUrl ?? null,
    title: ad.title ?? null,
    description: ad.description ?? null,
    destinationUrl: ad.destinationUrl ?? null,
    status: ad.status,
    adminReason: ad.adminReason ?? null,
    startsAt: ad.startsAt?.toISOString() ?? null,
    endsAt: ad.endsAt?.toISOString() ?? null,
    pausedAt: ad.pausedAt?.toISOString() ?? null,
    heldAt: ad.heldAt?.toISOString() ?? null,
    metrics: ad.metrics,
    createdAt: ad.createdAt.toISOString(),
    updatedAt: ad.updatedAt.toISOString(),
  };
}
