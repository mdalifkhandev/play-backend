import type { UserDocument } from './user.model.js';

export interface PublicUserDto {
  id: string;
  email: string;
  role: string;
  status: string;
  isEmailVerified: boolean;
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
    role: user.role,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
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
