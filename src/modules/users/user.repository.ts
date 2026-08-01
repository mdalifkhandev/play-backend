import type { Types } from 'mongoose';

import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { UserModel, type User, type UserDocument, type UserProfile } from './user.model.js';

type CreateUserInput = Pick<User, 'email' | 'passwordHash'> &
  Partial<Pick<User, 'phoneNumber' | 'role' | 'status' | 'isEmailVerified'>>;

export class UserRepository {
  async create(input: CreateUserInput): Promise<UserDocument> {
    return UserModel.create(input);
  }

  async findById(userId: string | Types.ObjectId): Promise<UserDocument | null> {
    return UserModel.findById(userId).exec();
  }

  async findByEmail(
    email: string,
    options: { includePassword?: boolean } = {},
  ): Promise<UserDocument | null> {
    const query = UserModel.findOne({ email });

    if (options.includePassword) {
      query.select('+passwordHash');
    }

    return query.exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    return (await UserModel.exists({ email })) !== null;
  }

  async existsByUsername(username: string, excludeUserId?: string): Promise<boolean> {
    return (
      (await UserModel.exists({
        'profile.username': username,
        ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
      })) !== null
    );
  }

  async existsByPhoneNumber(phoneNumber: string, excludeUserId?: string): Promise<boolean> {
    return (
      (await UserModel.exists({
        phoneNumber,
        ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
      })) !== null
    );
  }

  async markEmailVerified(userId: string | Types.ObjectId): Promise<UserDocument | null> {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          status: AccountStatus.ACTIVE,
        },
      },
      { new: true },
    ).exec();
  }

  async updatePassword(
    userId: string | Types.ObjectId,
    passwordHash: string,
  ): Promise<void> {
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
        },
        $unset: { lockedUntil: 1 },
      },
    ).exec();
  }

  async recordFailedLogin(user: UserDocument): Promise<void> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1_000);
    }

    await user.save();
  }

  async recordSuccessfulLogin(user: UserDocument): Promise<void> {
    user.failedLoginAttempts = 0;
    user.set('lockedUntil', undefined);
    user.lastLoginAt = new Date();
    await user.save();
  }

  async updateProfile(
    userId: string | Types.ObjectId,
    profile: Partial<UserProfile>,
    account: Partial<Pick<User, 'phoneNumber' | 'dateOfBirth'>> = {},
  ): Promise<UserDocument | null> {
    const profileUpdate = Object.fromEntries(
      Object.entries(profile)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [`profile.${key}`, value]),
    );
    const accountUpdate = Object.fromEntries(
      Object.entries(account).filter(([, value]) => value !== undefined),
    );

    return UserModel.findByIdAndUpdate(
      userId,
      { $set: { ...profileUpdate, ...accountUpdate } },
      { new: true, runValidators: true },
    ).exec();
  }
}

export const userRepository = new UserRepository();
