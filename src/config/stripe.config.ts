import Stripe from 'stripe';
import { env } from './env.config.js';
import { externalTimeoutMs } from '../infrastructure/http/external-timeout.js';
import { BadRequestError } from '../common/errors/bad-request-error.js';

let stripeInstance: Stripe | null = null;

export function getStripeInstance(): Stripe {
  if (!stripeInstance) {
    const secretKey = env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestError(
        'Stripe payment gateway is not configured on the server. Please add STRIPE_SECRET_KEY in your backend .env file.',
        { code: 'STRIPE_NOT_CONFIGURED' },
      );
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
      maxNetworkRetries: 2,
      timeout: externalTimeoutMs.stripe,
    });
  }
  return stripeInstance;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const instance = getStripeInstance();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
