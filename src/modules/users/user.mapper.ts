import type { UserDocument } from './user.model.js';

export interface PublicUserDto {
  id: string;
  email: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  role: string;
  status: string;
  isEmailVerified: boolean;
  coinBalance: number;
  stripeConnectAccountId?: string;
  stripeConnectOnboardingComplete: boolean;
  subscription: {
    plan?: string;
    status: 'none' | 'active' | 'expired' | 'canceled' | 'hold';
    expiresAt?: string;
    isPremium: boolean;
  };
  preferredLanguageCode?: string;
  profile: {
    username?: string;
    displayName?: string;
    bio?: string;
    photoUrl?: string;
    instagram?: string;
    youtube?: string;
    isSetupComplete: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export function toPublicUser(user: UserDocument): PublicUserDto {
  const profile = user.profile;
  const currentSubscription = resolveCurrentSubscription(user);
  const subscriptionPlan = currentSubscription?.planId;
  const subscriptionStatus = currentSubscription?.status ?? 'none';
  const subscriptionExpiresAt = currentSubscription?.expiresAt;
  const isPremium = isActivePremiumSubscription({
    ...(subscriptionPlan ? { plan: subscriptionPlan } : {}),
    status: subscriptionStatus,
    ...(subscriptionExpiresAt ? { expiresAt: subscriptionExpiresAt } : {}),
    ...(currentSubscription?.interval ? { interval: currentSubscription.interval } : {}),
  });

  return {
    id: user._id.toString(),
    email: user.email,
    ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
    ...(user.dateOfBirth ? { dateOfBirth: user.dateOfBirth.toISOString().slice(0, 10) } : {}),
    role: user.role,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
    coinBalance: user.coinBalance ?? 0,
    ...(user.stripeConnectAccountId ? { stripeConnectAccountId: user.stripeConnectAccountId } : {}),
    stripeConnectOnboardingComplete: user.stripeConnectOnboardingComplete ?? false,
    subscription: {
      ...(subscriptionPlan ? { plan: subscriptionPlan } : {}),
      status: subscriptionStatus,
      ...(subscriptionExpiresAt ? { expiresAt: new Date(subscriptionExpiresAt).toISOString() } : {}),
      isPremium,
    },
    ...(user.preferredLanguageCode ? { preferredLanguageCode: user.preferredLanguageCode } : {}),
    profile: {
      ...(profile.username ? { username: profile.username } : {}),
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.bio ? { bio: profile.bio } : {}),
      ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
      ...(profile.instagram ? { instagram: profile.instagram } : {}),
      ...(profile.youtube ? { youtube: profile.youtube } : {}),
      isSetupComplete: profile.isSetupComplete,
    },
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function resolveCurrentSubscription(user: UserDocument) {
  const subscription = (user as any).currentSubscriptionId;
  if (!subscription || typeof subscription !== 'object' || !('planId' in subscription)) {
    return undefined;
  }

  return subscription as {
    planId?: string;
    status?: 'none' | 'active' | 'expired' | 'canceled' | 'hold';
    expiresAt?: Date;
    provider?: 'revenuecat' | 'apple_pay' | 'stripe';
    providerSubscriptionId?: string;
    interval?: string;
  };
}

function isActivePremiumSubscription(input: {
  plan?: string;
  status?: string;
  expiresAt?: Date;
  interval?: string;
}) {
  if (input.status !== 'active') return false;
  if (input.interval === 'lifetime' || input.plan?.toLowerCase().includes('lifetime')) return true;
  return Boolean(input.expiresAt && new Date(input.expiresAt).getTime() > Date.now());
}
