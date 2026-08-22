import { randomUUID } from 'node:crypto';

import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { env } from '../../config/env.config.js';
import { UserModel } from '../users/user.model.js';
import type { SubscriptionPlanId } from './subscription.validation.js';

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

function addPlanTime(currentExpiry: Date | undefined, plan: SubscriptionPlan): Date {
  const base = currentExpiry && currentExpiry.getTime() > Date.now() ? new Date(currentExpiry) : new Date();
  if (plan.interval === 'year') {
    base.setFullYear(base.getFullYear() + 1);
  } else {
    base.setMonth(base.getMonth() + 1);
  }
  return base;
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

  async createSquareSubscription(userId: string, planId: SubscriptionPlanId, sourceId: string) {
    const plan = getPlan(planId);
    const user = await UserModel.findById(userId)
      .select('subscriptionExpiresAt subscriptionStatus')
      .exec();

    if (!user) {
      throw new NotFoundError('User was not found.');
    }

    if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
      throw new BadRequestError('Square payment is not configured.', {
        code: 'SQUARE_PAYMENT_NOT_CONFIGURED',
      });
    }

    const squareBaseUrl =
      env.SQUARE_ENVIRONMENT === 'production'
        ? 'https://connect.squareup.com'
        : 'https://connect.squareupsandbox.com';

    const squareResponse = await fetch(`${squareBaseUrl}/v2/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Square-Version': '2026-08-20',
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: `sub-${randomUUID()}`,
        location_id: env.SQUARE_LOCATION_ID,
        amount_money: {
          amount: Math.round(plan.price * 100),
          currency: plan.currency.toUpperCase(),
        },
        note: `${plan.name} subscription`,
        reference_id: `${userId}-${plan.id}`,
      }),
    });

    const squarePayload = await squareResponse.json().catch(() => ({}));

    if (!squareResponse.ok || !squarePayload?.payment?.id) {
      throw new BadRequestError(
        squarePayload?.errors?.[0]?.detail || 'Square payment failed.',
        { code: 'SQUARE_PAYMENT_FAILED' },
      );
    }

    const payment = squarePayload.payment as { id: string; status?: string };

    if (payment.status !== 'COMPLETED' && payment.status !== 'APPROVED') {
      throw new BadRequestError(`Square payment status is ${payment.status || 'unknown'}.`, {
        code: 'SQUARE_PAYMENT_NOT_COMPLETED',
      });
    }

    const expiresAt = addPlanTime(user.subscriptionExpiresAt, plan);
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          subscriptionPlan: plan.id,
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expiresAt,
          subscriptionProvider: 'square',
          subscriptionPaymentId: payment.id,
        },
      },
    ).exec();

    return {
      paymentProvider: 'square' as const,
      paymentId: payment.id,
      plan,
      subscription: {
        plan: plan.id,
        status: 'active' as const,
        expiresAt: expiresAt.toISOString(),
        isPremium: true,
      },
      status: payment.status,
    };
  }
}

export const subscriptionService = new SubscriptionService();
