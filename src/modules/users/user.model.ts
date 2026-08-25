import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';

export interface UserProfile {
  username?: string;
  displayName?: string;
  bio?: string;
  photoUrl?: string;
  photoPublicId?: string;
  instagram?: string;
  youtube?: string;
  isSetupComplete: boolean;
}

export interface KidsProfile {
  name?: string;
  ageRange?: string;
  dailyLimitMs?: number;
  expireAt?: Date;
  isActive: boolean;
}

export interface User {
  _id: Types.ObjectId;
  email: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  passwordHash: string;
  role: UserRole;
  status: AccountStatus;
  isEmailVerified: boolean;
  emailVerifiedAt?: Date;
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  coinBalance: number;
  diamondBalance: number;
  availableBalanceUsd: number;
  pendingBalanceUsd: number;
  stripeConnectAccountId?: string;
  stripeConnectOnboardingComplete: boolean;
  subscriptionPlan?: string;
  subscriptionStatus: 'none' | 'active' | 'expired' | 'canceled' | 'hold';
  subscriptionExpiresAt?: Date;
  subscriptionProvider?: 'revenuecat' | 'apple_pay' | 'stripe';
  subscriptionPaymentId?: string;
  profile: UserProfile;
  kidsModePin?: string;
  kidsProfile?: KidsProfile;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userProfileSchema = new Schema<UserProfile>(
  {
    username: { type: String, trim: true, lowercase: true, minlength: 3, maxlength: 30 },
    displayName: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 500 },
    photoUrl: { type: String, trim: true },
    photoPublicId: { type: String, trim: true },
    instagram: { type: String, trim: true, maxlength: 120 },
    youtube: { type: String, trim: true, maxlength: 250 },
    isSetupComplete: { type: Boolean, default: false },
  },
  { _id: false },
);

const kidsProfileSchema = new Schema<KidsProfile>(
  {
    name: { type: String, trim: true, maxlength: 80 },
    ageRange: { type: String, trim: true, maxlength: 20 },
    dailyLimitMs: { type: Number },
    expireAt: { type: Date },
    isActive: { type: Boolean, default: false },
  },
  { _id: false },
);

const userSchema = new Schema<User>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    phoneNumber: { type: String, trim: true, unique: true, sparse: true },
    dateOfBirth: { type: Date, min: new Date('1900-01-01T00:00:00.000Z') },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.ACTIVE,
      required: true,
    },
    isEmailVerified: { type: Boolean, default: false, required: true },
    emailVerifiedAt: { type: Date },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0, min: 0, required: true },
    lockedUntil: { type: Date },
    coinBalance: { type: Number, default: 0, min: 0, required: true },
    diamondBalance: { type: Number, default: 0, min: 0, required: true },
    availableBalanceUsd: { type: Number, default: 0, min: 0, required: true },
    pendingBalanceUsd: { type: Number, default: 0, min: 0, required: true },
    stripeConnectAccountId: { type: String, trim: true, sparse: true },
    stripeConnectOnboardingComplete: { type: Boolean, default: false, required: true },
    subscriptionPlan: { type: String, trim: true },
    subscriptionStatus: {
      type: String,
      enum: ['none', 'active', 'expired', 'canceled', 'hold'],
      default: 'none',
      required: true,
    },
    subscriptionExpiresAt: { type: Date },
    subscriptionProvider: { type: String, enum: ['revenuecat', 'apple_pay', 'stripe'], trim: true },
    subscriptionPaymentId: { type: String, trim: true },
    profile: { type: userProfileSchema, default: () => ({ isSetupComplete: false }) },
    kidsModePin: { type: String, trim: true, select: false },
    kidsProfile: { type: kidsProfileSchema, default: () => ({ isActive: false }) },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ 'profile.username': 1 }, { unique: true, sparse: true });
userSchema.index({ status: 1, role: 1 });
userSchema.index({ subscriptionStatus: 1, subscriptionExpiresAt: 1 });

export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ?? model<User>('User', userSchema);
