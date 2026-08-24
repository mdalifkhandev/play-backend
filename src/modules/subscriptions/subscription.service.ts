import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { env } from '../../config/env.config.js';
import { UserModel } from '../users/user.model.js';
import type { SubscriptionPlanId, SyncRevenueCatSubscriptionInput } from './subscription.validation.js';

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  interval: 'month' | 'year';
  price: number;
  currency: 'usd';
  discountLabel?: string;
  features: string[];
};

const plans: SubscriptionPlan[] = [
  {
    id: 'monthly',
    name: 'Premium Monthly',
    interval: 'month',
    price: 25,
    currency: 'usd',
    features: ['No ads in feed', 'Uninterrupted watching', 'Premium badge on profile'],
  },
  {
    id: 'yearly',
    name: 'Premium Yearly',
    interval: 'year',
    price: 254.15,
    currency: 'usd',
    discountLabel: '15% OFF',
    features: ['No ads in feed', 'Uninterrupted watching', 'Premium badge on profile'],
  },
];

function getPlan(planId: SubscriptionPlanId): SubscriptionPlan {
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    throw new NotFoundError('Subscription plan was not found.');
  }
  return plan;
}

export class SubscriptionService {
  getPlans() {
    return plans;
  }

  async getCurrentSubscription(userId: string) {
    const user = await UserModel.findById(userId)
      .select('subscriptionPlan subscriptionStatus subscriptionExpiresAt subscriptionProvider subscriptionPaymentId')
      .exec();

    if (!user) {
      throw new NotFoundError('User was not found.');
    }

    const isPremium = Boolean(
      user.subscriptionStatus === 'active' &&
      user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt.getTime() > Date.now(),
    );

    if (user.subscriptionStatus === 'active' && !isPremium) {
      await UserModel.updateOne({ _id: userId }, { $set: { subscriptionStatus: 'expired' } }).exec();
      user.subscriptionStatus = 'expired';
    }

    return {
      plan: user.subscriptionPlan,
      status: user.subscriptionStatus ?? 'none',
      expiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : undefined,
      provider: user.subscriptionProvider,
      paymentId: user.subscriptionPaymentId,
      isPremium,
    };
  }

  async syncRevenueCatSubscription(userId: string, input: SyncRevenueCatSubscriptionInput) {
    const plan = getPlan(input.planId);
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

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          subscriptionPlan: plan.id,
          subscriptionStatus: 'active',
          ...(expiresAt ? { subscriptionExpiresAt: expiresAt } : {}),
          subscriptionProvider: 'revenuecat',
          subscriptionPaymentId: entitlement?.product_identifier || input.productIdentifier,
        },
      },
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
}

export const subscriptionService = new SubscriptionService();

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
