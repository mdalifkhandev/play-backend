import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { env } from '../../config/env.config.js';
import { stripe } from '../../config/stripe.config.js';
import { UserModel } from '../users/user.model.js';
import { SubscriptionPaymentModel } from './subscription-payment.model.js';
import { SubscriptionPlanModel, SubscriptionPlanSeedStateModel, type SubscriptionPlan as SubscriptionPlanRecord } from './subscription-plan.model.js';
import { UserSubscriptionModel } from './user-subscription.model.js';
import { cacheKeyPrefixes, cacheKeys } from '../../infrastructure/cache/cache-keys.js';
import { cacheService } from '../../infrastructure/cache/cache.service.js';
import type {
  AdminCreateSubscriptionPlanInput,
  AdminUpdateSubscriberStatusInput,
  AdminUpdateSubscriptionPlanInput,
  CreateStripeSubscriptionPaymentIntentInput,
  SubscriptionPlanId,
  SyncRevenueCatSubscriptionInput,
  VerifyStripeSubscriptionPaymentInput,
} from './subscription.validation.js';

const SUBSCRIPTION_PLAN_CACHE_TTL_SECONDS = 300;

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  interval: 'month' | 'year' | 'lifetime';
  price: number;
  currency: 'usd';
  discountLabel?: string;
  productIdentifier?: string;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

const defaultPlans: SubscriptionPlan[] = [
  {
    id: 'monthly',
    name: 'Premium Monthly',
    interval: 'month',
    price: 25,
    currency: 'usd',
    features: ['No ads in feed', 'Uninterrupted watching', 'Premium badge on profile'],
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'yearly',
    name: 'Premium Yearly',
    interval: 'year',
    price: 254.15,
    currency: 'usd',
    discountLabel: '15% OFF',
    features: ['No ads in feed', 'Uninterrupted watching', 'Premium badge on profile'],
    isActive: true,
    sortOrder: 20,
  },
];

export class SubscriptionService {
  async normalizeUserSubscription(user: any) {
    if (user.currentSubscriptionId) {
      const currentSubscription = await UserSubscriptionModel.findById(user.currentSubscriptionId).lean().exec();
      const isCurrentPremium = currentSubscription ? isUserSubscriptionPremium(currentSubscription as any) : false;

      if (isCurrentPremium) return user;

      await UserSubscriptionModel.updateOne(
        { _id: user.currentSubscriptionId, status: 'active' },
        {
          $set: {
            status: currentSubscription ? 'expired' : 'canceled',
            ...(currentSubscription ? {} : { canceledAt: new Date() }),
          },
        },
      ).exec();

      await clearUserSubscription(user._id);
      return (await UserModel.findById(user._id).exec()) ?? user;
    }

    return user;
  }

  async getPlans() {
    return cacheService.getOrSet(cacheKeys.activeSubscriptionPlans, SUBSCRIPTION_PLAN_CACHE_TTL_SECONDS, async () => {
      await ensureDefaultPlans();
      const plans = await SubscriptionPlanModel.find({ isActive: true, isDeleted: { $ne: true } })
        .sort({ sortOrder: 1, price: 1, createdAt: 1 })
        .lean()
        .exec();

      return plans.map(mapPlan);
    });
  }

  async listPlansForAdmin() {
    await ensureDefaultPlans();
    const plans = await SubscriptionPlanModel.find({ isDeleted: { $ne: true } })
      .sort({ sortOrder: 1, price: 1, createdAt: 1 })
      .lean()
      .exec();

    return plans.map(mapPlan);
  }

  async listSubscribersForAdmin(input: { page?: number; limit?: number; status?: string; planId?: string }) {
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(input.limit) || 10));
    const filter: Record<string, unknown> = {};
    const requestedPlanId = input.planId && input.planId !== 'all' ? input.planId : undefined;

    if (input.status && input.status !== 'all') {
      filter.status = input.status;
    }

    if (requestedPlanId) {
      filter.planId = requestedPlanId;
    }

    const [items, total] = await Promise.all([
      UserSubscriptionModel.find(filter)
        .populate({ path: 'userId', select: 'email profile createdAt' })
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      UserSubscriptionModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((sub: any) => {
        const user = sub.userId;
        return {
          id: user?._id?.toString() || sub._id.toString(),
          email: user?.email || '',
          displayName: user?.profile?.displayName || user?.profile?.username || user?.email?.split('@')[0] || 'Unknown',
          username: user?.profile?.username,
          avatarUrl: user?.profile?.photoUrl,
          plan: sub.planId,
          status: sub.status,
          expiresAt: sub.expiresAt ? sub.expiresAt.toISOString() : undefined,
          provider: sub.provider,
          paymentId: sub.providerSubscriptionId,
          isPremium: sub.status === 'active' && (sub.interval === 'lifetime' || (sub.expiresAt && new Date(sub.expiresAt).getTime() > Date.now())),
          updatedAt: sub.updatedAt ? sub.updatedAt.toISOString() : undefined,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateSubscriberStatusForAdmin(userId: string, input: AdminUpdateSubscriberStatusInput) {
    const user = await UserModel.findById(userId)
      .select('email profile currentSubscriptionId updatedAt')
      .populate('currentSubscriptionId')
      .exec();

    if (!user) {
      throw new NotFoundError('Subscriber was not found.');
    }

    if (!user.currentSubscriptionId && input.status === 'active') {
      throw new BadRequestError('Subscriber does not have a subscription plan to activate.', {
        code: 'SUBSCRIPTION_PLAN_MISSING',
      });
    }

    if (user.currentSubscriptionId) {
      await UserSubscriptionModel.updateOne(
        { _id: user.currentSubscriptionId },
        {
          $set: {
            status: input.status,
            ...(input.status === 'canceled' ? { canceledAt: new Date() } : {}),
          },
        },
      ).exec();
    }

    await user.save();
    await user.populate('currentSubscriptionId');

    return {
      id: user._id.toString(),
      email: user.email,
      displayName: user.profile?.displayName || user.profile?.username || user.email.split('@')[0],
      username: user.profile?.username,
      avatarUrl: user.profile?.photoUrl,
      plan: getSubscriptionPlanId(user),
      status: getSubscriptionStatus(user),
      expiresAt: getSubscriptionExpiresAt(user),
      provider: getSubscriptionProvider(user),
      paymentId: getSubscriptionPaymentId(user),
      isPremium: isSubscriptionPremium(user),
      updatedAt: user.updatedAt ? user.updatedAt.toISOString() : undefined,
    };
  }

  async createPlan(input: AdminCreateSubscriptionPlanInput) {
    const payload: Partial<SubscriptionPlanRecord> = {
      planId: input.planId,
      name: input.name,
      interval: input.interval,
      price: input.price,
      currency: input.currency,
      features: input.features,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    };

    if (input.discountLabel) payload.discountLabel = input.discountLabel;
    if (input.productIdentifier) payload.productIdentifier = input.productIdentifier;

    const plan = await new SubscriptionPlanModel(payload).save();
    await cacheService.deleteByPrefix(cacheKeyPrefixes.subscriptions);

    return mapPlan(plan.toObject());
  }

  async updatePlan(planId: SubscriptionPlanId, input: AdminUpdateSubscriptionPlanInput) {
    const setPayload = { ...input };
    delete setPayload.discountLabel;
    delete setPayload.productIdentifier;

    const update: Record<string, unknown> = { $set: setPayload };
    const unset: Record<string, ''> = {};

    if (input.discountLabel !== undefined) {
      if (input.discountLabel) update.$set = { ...(update.$set as Record<string, unknown>), discountLabel: input.discountLabel };
      else unset.discountLabel = '';
    }

    if (input.productIdentifier !== undefined) {
      if (input.productIdentifier) update.$set = { ...(update.$set as Record<string, unknown>), productIdentifier: input.productIdentifier };
      else unset.productIdentifier = '';
    }

    if (Object.keys(unset).length) update.$unset = unset;

    const updated = await SubscriptionPlanModel.findOneAndUpdate(
      { planId },
      update,
      { new: true, runValidators: true },
    )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundError('Subscription plan was not found.');
    }

    await cacheService.deleteByPrefix(cacheKeyPrefixes.subscriptions);

    return mapPlan(updated);
  }

  async deletePlan(planId: SubscriptionPlanId) {
    const deleted = await SubscriptionPlanModel.findOneAndUpdate(
      { planId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, isActive: false } },
      { new: false },
    ).lean().exec();

    if (!deleted) {
      throw new NotFoundError('Subscription plan was not found.');
    }

    await cacheService.deleteByPrefix(cacheKeyPrefixes.subscriptions);

    return { id: deleted.planId };
  }

  async getCurrentSubscription(userId: string) {
    const user = await UserModel.findById(userId).populate('currentSubscriptionId').exec();
    if (!user) throw new NotFoundError('User was not found.');
    
    const sub = user.currentSubscriptionId as any;
    
    return {
      plan: sub?.planId,
      status: sub?.status ?? 'none',
      expiresAt: sub?.expiresAt ? new Date(sub.expiresAt).toISOString() : undefined,
      provider: sub?.provider,
      paymentId: sub?.providerSubscriptionId,
      isPremium: sub ? isUserSubscriptionPremium(sub) : false,
    };
  }

  async cancelCurrentSubscription(userId: string) {
    const user = await UserModel.findById(userId).populate('currentSubscriptionId').exec();
    if (!user) throw new NotFoundError('User was not found.');

    const sub = user.currentSubscriptionId as any;
    if (!sub || (sub.status !== 'active' && sub.status !== 'hold')) {
      throw new BadRequestError('There is no active subscription to cancel.', { code: 'SUBSCRIPTION_NOT_ACTIVE' });
    }

    await UserSubscriptionModel.updateOne(
      { _id: sub._id },
      { $set: { status: 'canceled', canceledAt: new Date() } }
    ).exec();
    
    sub.status = 'canceled';

    return {
      plan: sub.planId,
      status: sub.status,
      expiresAt: sub.expiresAt ? new Date(sub.expiresAt).toISOString() : undefined,
      provider: sub.provider,
      paymentId: sub.providerSubscriptionId,
      isPremium: false,
    };
  }

  async syncRevenueCatSubscription(userId: string, input: SyncRevenueCatSubscriptionInput) {
    const plan = await getPlan(input.planId);
    const user = await UserModel.findById(userId).select('_id').exec();

    if (!user) {
      throw new NotFoundError('User was not found.');
    }

    if (!env.REVENUECAT_SECRET_API_KEY) {
      throw new BadRequestError('RevenueCat is not configured.', {
        code: 'REVENUECAT_NOT_CONFIGURED',
      });
    }

    const subscriber = await fetchRevenueCatSubscriber(userId, input.platform);
    const entitlement = subscriber?.entitlements?.[env.REVENUECAT_ENTITLEMENT_ID];
    const expiresAt = entitlement?.expires_date ? new Date(entitlement.expires_date) : undefined;
    const isActive = Boolean(entitlement && (!expiresAt || expiresAt.getTime() > Date.now()));

    if (!isActive) {
      throw new BadRequestError('RevenueCat premium entitlement is not active.', {
        code: 'REVENUECAT_ENTITLEMENT_INACTIVE',
      });
    }

    const subscription = await (UserSubscriptionModel as any).findOneAndUpdate(
      { userId, provider: 'revenuecat', providerSubscriptionId: entitlement?.product_identifier || input.productIdentifier },
      {
        $set: {
          userId,
          planId: plan.id,
          planName: plan.name,
          interval: plan.interval,
          status: 'active',
          provider: 'revenuecat',
          providerSubscriptionId: entitlement?.product_identifier || input.productIdentifier,
          startedAt: new Date(),
          ...(expiresAt ? { expiresAt } : {}),
        },
        ...(expiresAt ? {} : { $unset: { expiresAt: '' } }),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    await UserModel.updateOne(
      { _id: userId },
      { $set: { currentSubscriptionId: subscription._id } }
    ).exec();

    return {
      paymentProvider: 'revenuecat' as const,
      productIdentifier: entitlement?.product_identifier || input.productIdentifier || '',
      plan,
      subscription: {
        plan: plan.id,
        status: 'active' as const,
        expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
        provider: 'revenuecat' as const,
        paymentId: entitlement?.product_identifier || input.productIdentifier,
        isPremium: true,
      },
    };
  }

  async createStripePaymentIntent(userId: string, input: CreateStripeSubscriptionPaymentIntentInput) {
    const [plan, user] = await Promise.all([
      getPlan(input.planId),
      UserModel.findById(userId).select('email').exec(),
    ]);

    if (!user) {
      throw new NotFoundError('User was not found.');
    }

    if (plan.price <= 0) {
      throw new BadRequestError('This subscription plan cannot be purchased with Stripe.', {
        code: 'SUBSCRIPTION_PLAN_NOT_PURCHASABLE',
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(plan.price * 100),
      currency: plan.currency,
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: user.email,
      metadata: {
        type: 'subscription',
        userId,
        planId: plan.id,
        planName: plan.name,
        interval: plan.interval,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? '',
      amount: plan.price,
      currency: plan.currency,
      plan,
    };
  }

  async verifyStripePayment(userId: string, input: VerifyStripeSubscriptionPaymentInput) {
    const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);

    if (paymentIntent.metadata?.type !== 'subscription') {
      throw new BadRequestError('Payment intent is not a subscription payment.');
    }

    if (paymentIntent.metadata.userId !== userId) {
      throw new BadRequestError('Payment intent does not belong to the authenticated user.');
    }

    const planId = paymentIntent.metadata.planId;
    if (!planId) {
      throw new BadRequestError('Subscription plan was missing from payment metadata.');
    }
    const plan = await getPlan(planId);

    if (paymentIntent.status !== 'succeeded') {
      return {
        status: paymentIntent.status,
        paymentProvider: 'stripe' as const,
        paymentIntentId: paymentIntent.id,
        plan,
        subscription: await this.getCurrentSubscription(userId),
      };
    }

    const expiresAt = getSubscriptionExpiry(plan.interval);
    const subscription = await (UserSubscriptionModel as any).findOneAndUpdate(
      { userId, provider: 'stripe', providerSubscriptionId: paymentIntent.id },
      {
        $set: {
          userId,
          planId: plan.id,
          planName: plan.name,
          interval: plan.interval,
          status: 'active',
          provider: 'stripe',
          providerSubscriptionId: paymentIntent.id,
          startedAt: new Date(),
          ...(expiresAt ? { expiresAt } : {}),
        },
        ...(expiresAt ? {} : { $unset: { expiresAt: '' } }),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    await SubscriptionPaymentModel.updateOne(
      { provider: 'stripe', providerPaymentId: paymentIntent.id },
      {
        $setOnInsert: {
          userId,
          subscriptionId: subscription._id,
          planId: plan.id,
          planName: plan.name,
          interval: plan.interval,
          amount: plan.price,
          currency: plan.currency,
          provider: 'stripe',
          providerPaymentId: paymentIntent.id,
          status: 'completed',
          completedAt: new Date(),
        },
      },
      { upsert: true },
    ).exec();

    await UserModel.updateOne(
      { _id: userId },
      { $set: { currentSubscriptionId: subscription._id } }
    ).exec();

    return {
      status: 'completed',
      paymentProvider: 'stripe' as const,
      paymentIntentId: paymentIntent.id,
      plan,
      subscription: {
        plan: plan.id,
        status: 'active' as const,
        expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
        provider: 'stripe' as const,
        paymentId: paymentIntent.id,
        isPremium: true,
      },
    };
  }
}

export const subscriptionService = new SubscriptionService();

async function getPlan(planId: SubscriptionPlanId): Promise<SubscriptionPlan> {
  await ensureDefaultPlans();
  const plan = await SubscriptionPlanModel.findOne({ planId, isActive: true }).lean().exec();
  if (!plan) {
    throw new NotFoundError('Subscription plan was not found.');
  }
  return mapPlan(plan);
}

async function ensureDefaultPlans() {
  const [count, seedState] = await Promise.all([
    SubscriptionPlanModel.estimatedDocumentCount().exec(),
    SubscriptionPlanSeedStateModel.findById('default-subscription-plans').lean().exec(),
  ]);
  if (count > 0 || seedState) return;

  await SubscriptionPlanModel.insertMany(
    defaultPlans.map((plan) => ({
      planId: plan.id,
      name: plan.name,
      interval: plan.interval,
      price: plan.price,
      currency: plan.currency,
      discountLabel: plan.discountLabel,
      features: plan.features,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    })),
    { ordered: true },
  );

  await SubscriptionPlanSeedStateModel.updateOne(
    { _id: 'default-subscription-plans' },
    { $set: { seededAt: new Date() } },
    { upsert: true },
  ).exec();
}

function mapPlan(plan: SubscriptionPlanRecord | (SubscriptionPlanRecord & { _id?: unknown })): SubscriptionPlan {
  const mapped: SubscriptionPlan = {
    id: plan.planId,
    name: plan.name,
    interval: plan.interval,
    price: plan.price,
    currency: plan.currency,
    features: plan.features,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };

  if (plan.discountLabel) mapped.discountLabel = plan.discountLabel;
  if (plan.productIdentifier) mapped.productIdentifier = plan.productIdentifier;

  return mapped;
}

function getSubscriptionExpiry(interval: SubscriptionPlan['interval']) {
  if (interval === 'lifetime') return undefined;

  const expiresAt = new Date();
  if (interval === 'year') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    return expiresAt;
  }

  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt;
}

function getCurrentSubscriptionRecord(user: any) {
  const subscription = user.currentSubscriptionId;
  if (!subscription || typeof subscription !== 'object' || !('planId' in subscription)) return undefined;
  return subscription as {
    planId?: string;
    status?: string;
    expiresAt?: Date;
    provider?: string;
    providerSubscriptionId?: string;
    interval?: string;
  };
}

function getSubscriptionPlanId(user: any) {
  return getCurrentSubscriptionRecord(user)?.planId ?? user.subscriptionPlan;
}

function getSubscriptionStatus(user: any) {
  return getCurrentSubscriptionRecord(user)?.status ?? user.subscriptionStatus ?? 'none';
}

function getSubscriptionExpiresAt(user: any) {
  const expiresAt = getCurrentSubscriptionRecord(user)?.expiresAt ?? user.subscriptionExpiresAt;
  return expiresAt ? new Date(expiresAt).toISOString() : undefined;
}

function getSubscriptionProvider(user: any) {
  return getCurrentSubscriptionRecord(user)?.provider ?? user.subscriptionProvider;
}

function getSubscriptionPaymentId(user: any) {
  return getCurrentSubscriptionRecord(user)?.providerSubscriptionId ?? user.subscriptionPaymentId;
}

function isUserSubscriptionPremium(subscription: {
  status?: string;
  interval?: string;
  planId?: string;
  expiresAt?: Date;
}) {
  if (subscription.status !== 'active') return false;
  if (subscription.interval === 'lifetime' || subscription.planId?.toLowerCase().includes('lifetime')) return true;
  return Boolean(subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now());
}

function isSubscriptionPremium(user: any) {
  const currentSubscription = getCurrentSubscriptionRecord(user);
  if (currentSubscription) return isUserSubscriptionPremium(currentSubscription);

  if (user.subscriptionStatus !== 'active') return false;
  if (user.subscriptionPlan && user.subscriptionPlan.toLowerCase().includes('lifetime')) return true;
  return Boolean(user.subscriptionExpiresAt && user.subscriptionExpiresAt.getTime() > Date.now());
}

async function clearUserSubscription(userId: any) {
  await UserModel.updateOne({ _id: userId }, { $unset: { currentSubscriptionId: '' } }).exec();
}

type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, {
      expires_date?: string | null;
      product_identifier?: string;
    }>;
  };
};

async function fetchRevenueCatSubscriber(userId: string, platform: 'ios' | 'android') {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Platform': platform,
    },
  });

  const payload = await response.json().catch(() => ({})) as RevenueCatSubscriberResponse & {
    message?: string;
  };

  if (!response.ok) {
    throw new BadRequestError(payload.message || 'RevenueCat subscription verification failed.', {
      code: 'REVENUECAT_VERIFICATION_FAILED',
    });
  }

  return payload.subscriber;
}
