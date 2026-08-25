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
      ...(user.subscriptionPlan ? { plan: user.subscriptionPlan } : {}),
      status: user.subscriptionStatus ?? 'none',
      ...(user.subscriptionExpiresAt ? { expiresAt: user.subscriptionExpiresAt.toISOString() } : {}),
      isPremium: Boolean(
        user.subscriptionStatus === 'active' &&
        (
          user.subscriptionPlan?.toLowerCase().includes('lifetime') ||
          (user.subscriptionExpiresAt && user.subscriptionExpiresAt.getTime() > Date.now())
        ),
      ),
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
