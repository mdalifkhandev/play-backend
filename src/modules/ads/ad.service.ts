import { AppError as AdAppError } from '../../common/errors/app-error.js';
import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { env } from '../../config/env.config.js';
import { stripe } from '../../config/stripe.config.js';
import { adminNotificationService } from '../notifications/admin-notification.service.js';
import { UserModel } from '../users/user.model.js';
import {
  adRepository,
  type AdMetricActor,
  type AdRepository,
} from './ad.repository.js';
import type { AdCampaignDocument, AdCampaignStatus } from './ad-campaign.model.js';
import { AdPackageModel, DEFAULT_AD_PACKAGES } from './ad-package.model.js';
import { AdCategoryModel, DEFAULT_AD_CATEGORIES } from './ad-category.model.js';
import type {
  AdFeedQuery,
  AdminAdActionInput,
  CreateAdCampaignInput,
  CreateAdPackageInput,
  CreateAdCategoryInput,
  ListAdsQuery,
  UpdateAdPackageInput,
  UpdateAdCategoryInput,
  VerifyAdStripePaymentInput,
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

  async createStripePaymentIntent(userId: string, adId: string) {
    const ad = await this.ads.findMine(userId, adId);
    if (!ad) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }
    if (ad.paymentStatus === 'paid') {
      throw new BadRequestError('This ad campaign is already paid.');
    }

    const amountInCents = Math.round(ad.budgetUsd * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        adId: ad._id.toString(),
        userId,
        type: 'ad_campaign',
        budgetUsd: ad.budgetUsd.toString(),
      },
    });

    await this.ads.updatePaymentIntent(adId, paymentIntent.id, paymentIntent.client_secret ?? '');

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? '',
      amount: ad.budgetUsd,
      currency: 'usd',
      adId: ad._id.toString(),
    };
  }

  async verifyStripePayment(userId: string, adId: string, input: VerifyAdStripePaymentInput) {
    const ad = await this.ads.findMine(userId, adId);
    if (!ad) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestError(`Payment not completed. Status: ${paymentIntent.status}`);
    }

    const updated = await this.ads.markAsPaid(adId, 'stripe', ad.budgetUsd, paymentIntent.id);
    void adminNotificationService.notifyAdmins({
      event: 'ad_campaign_submitted',
      title: 'New paid ad campaign submitted',
      body: `${ad.title || ad.category || 'Ad campaign'} ($${ad.budgetUsd} paid via Stripe) is ready for review.`,
      relatedEntityId: adId,
    });

    return mapAd(updated!);
  }

  async payWithCoins(userId: string, adId: string) {
    const ad = await this.ads.findMine(userId, adId);
    if (!ad) {
      throw new NotFoundError('Ad campaign was not found.', { code: 'AD_NOT_FOUND' });
    }
    if (ad.paymentStatus === 'paid') {
      throw new BadRequestError('This ad campaign is already paid.');
    }

    const coinsNeeded = Math.round(ad.budgetUsd * 100);
    const updatedUser = await UserModel.findOneAndUpdate(
      { _id: userId, coinBalance: { $gte: coinsNeeded } },
      { $inc: { coinBalance: -coinsNeeded } },
      { new: true },
    );

    if (!updatedUser) {
      throw new BadRequestError(`Insufficient coin balance. You need ${coinsNeeded} coins to buy this ad.`);
    }

    const updated = await this.ads.markAsPaid(adId, 'coins', ad.budgetUsd);
    void adminNotificationService.notifyAdmins({
      event: 'ad_campaign_submitted',
      title: 'New paid ad campaign submitted',
      body: `${ad.title || ad.category || 'Ad campaign'} ($${ad.budgetUsd} paid via ${coinsNeeded} coins) is ready for review.`,
      relatedEntityId: adId,
    });

    return {
      ad: mapAd(updated!),
      coinBalance: updatedUser.coinBalance,
      coinsDeducted: coinsNeeded,
    };
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

  async recordImpression(adId: string, actor: AdMetricActor) {
    await this.requireAd(adId);
    return this.ads.recordMetric(adId, 'impression', actor);
  }

  async recordClick(adId: string, actor: AdMetricActor) {
    await this.requireAd(adId);
    return this.ads.recordMetric(adId, 'click', actor);
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
      throw new AdAppError('This ad campaign cannot be paused.', 409, {
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
      throw new AdAppError('Only paused campaigns can be resumed.', 409, {
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

  async getActivePackages() {
    const count = await AdPackageModel.countDocuments();
    if (count === 0) {
      await AdPackageModel.insertMany(DEFAULT_AD_PACKAGES);
    }
    const packages = await AdPackageModel.find({ isActive: true })
      .sort({ sortOrder: 1, days: 1, priceUsd: 1 })
      .lean();
    return packages.map(mapAdPackage);
  }

  async listPackagesForAdmin() {
    const count = await AdPackageModel.countDocuments();
    if (count === 0) {
      await AdPackageModel.insertMany(DEFAULT_AD_PACKAGES);
    }
    const packages = await AdPackageModel.find()
      .sort({ sortOrder: 1, days: 1, priceUsd: 1 })
      .lean();
    return packages.map(mapAdPackage);
  }

  async createPackage(input: CreateAdPackageInput) {
    const payload: Record<string, unknown> = {
      name: input.name,
      days: input.days,
      priceUsd: input.priceUsd,
      targetUsers: input.targetUsers,
      isPopular: input.isPopular ?? false,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    };
    if (input.description !== undefined) {
      payload.description = input.description;
    }
    const created = await AdPackageModel.create(payload);
    return mapAdPackage(created);
  }

  async updatePackage(packageId: string, input: UpdateAdPackageInput) {
    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    const updated = await AdPackageModel.findByIdAndUpdate(
      packageId,
      { $set: updatePayload },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new NotFoundError('Ad package was not found.', { code: 'AD_PACKAGE_NOT_FOUND' });
    }
    return mapAdPackage(updated);
  }

  async deletePackage(packageId: string) {
    const deleted = await AdPackageModel.findByIdAndDelete(packageId);
    if (!deleted) {
      throw new NotFoundError('Ad package was not found.', { code: 'AD_PACKAGE_NOT_FOUND' });
    }
    return { id: packageId, deleted: true };
  }

  async getActiveCategories() {
    const count = await AdCategoryModel.countDocuments();
    if (count === 0) {
      await AdCategoryModel.insertMany(DEFAULT_AD_CATEGORIES);
    }
    const categories = await AdCategoryModel.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return categories.map(mapAdCategory);
  }

  async listCategoriesForAdmin() {
    const count = await AdCategoryModel.countDocuments();
    if (count === 0) {
      await AdCategoryModel.insertMany(DEFAULT_AD_CATEGORIES);
    }
    const categories = await AdCategoryModel.find()
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return categories.map(mapAdCategory);
  }

  async createCategory(input: CreateAdCategoryInput) {
    const slug = input.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const payload: Record<string, unknown> = {
      name: input.name.trim(),
      slug: slug || `category-${Date.now()}`,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    };
    if (input.icon !== undefined) payload.icon = input.icon;
    if (input.description !== undefined) payload.description = input.description;

    const created = await AdCategoryModel.create(payload);
    return mapAdCategory(created);
  }

  async updateCategory(categoryId: string, input: UpdateAdCategoryInput) {
    const updatePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }
    if (input.name) {
      updatePayload.name = input.name.trim();
      updatePayload.slug = input.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    const updated = await AdCategoryModel.findByIdAndUpdate(
      categoryId,
      { $set: updatePayload },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new NotFoundError('Ad category was not found.', { code: 'AD_CATEGORY_NOT_FOUND' });
    }
    return mapAdCategory(updated);
  }

  async deleteCategory(categoryId: string) {
    const deleted = await AdCategoryModel.findByIdAndDelete(categoryId);
    if (!deleted) {
      throw new NotFoundError('Ad category was not found.', { code: 'AD_CATEGORY_NOT_FOUND' });
    }
    return { id: categoryId, deleted: true };
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

  throw new AdAppError('Unsupported ad action.', 400, { code: 'AD_ACTION_INVALID' });
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
    throw new AdAppError(`Cannot ${action} an ad with status ${currentStatus}.`, 409, {
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
  const owner = (ad as any).ownerId;
  const ownerId = owner?._id ? owner._id.toString() : ad.ownerId.toString();

  return {
    id: ad._id.toString(),
    ownerId,
    owner: owner?._id
      ? {
          id: owner._id.toString(),
          email: owner.email,
          displayName: owner.profile?.displayName || owner.profile?.username || owner.email,
          username: owner.profile?.username,
          photoUrl: owner.profile?.photoUrl,
        }
      : null,
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
    ctaType: ad.ctaType ?? 'none',
    ctaLabel: ad.ctaLabel ?? null,
    status: ad.status,
    paymentStatus: ad.paymentStatus ?? 'unpaid',
    paymentProvider: ad.paymentProvider ?? null,
    paidAt: ad.paidAt?.toISOString() ?? null,
    paymentAmountUsd: ad.paymentAmountUsd ?? null,
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

function mapAdPackage(pkg: any) {
  return {
    id: pkg._id.toString(),
    name: pkg.name,
    days: pkg.days,
    priceUsd: pkg.priceUsd,
    targetUsers: pkg.targetUsers,
    description: pkg.description ?? '',
    isPopular: Boolean(pkg.isPopular),
    isActive: Boolean(pkg.isActive),
    sortOrder: pkg.sortOrder ?? 0,
    createdAt: pkg.createdAt ? new Date(pkg.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: pkg.updatedAt ? new Date(pkg.updatedAt).toISOString() : new Date().toISOString(),
  };
}

function mapAdCategory(cat: any) {
  return {
    id: cat._id.toString(),
    name: cat.name,
    slug: cat.slug,
    icon: cat.icon ?? '',
    description: cat.description ?? '',
    isActive: Boolean(cat.isActive),
    sortOrder: cat.sortOrder ?? 0,
    createdAt: cat.createdAt ? new Date(cat.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: cat.updatedAt ? new Date(cat.updatedAt).toISOString() : new Date().toISOString(),
  };
}
