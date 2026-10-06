import { Types } from 'mongoose';

import { NotFoundError } from '../../common/errors/not-found-error.js';
import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { coinRepository } from '../coins/coin.repository.js';
import { ReelStatus, ReelVisibility } from '../reels/reel.constants.js';
import { ReelModel } from '../reels/reel.model.js';
import { FollowModel } from '../users/follow.model.js';
import { UserModel } from '../users/user.model.js';
import { RewardProgramModel } from './reward-program.model.js';
import { RewardSettingModel, type RewardSetting } from './reward-setting.model.js';
import { RewardWinnerModel } from './reward-winner.model.js';
import type {
  CreateRewardProgramInput,
  FinalizeRewardWinnersInput,
  UpdateRewardProgramInput,
  UpdateRewardSettingsInput,
  UpdateRewardWinnerStatusInput,
} from './reward.validation.js';

const DEFAULT_REWARD_PERIOD_DAYS = 7;

function displayNameOf(user: any) {
  return user?.profile?.displayName || user?.profile?.username || user?.email || 'Creator';
}

function avatarOf(user: any) {
  return user?.profile?.photoUrl;
}

export class RewardService {
  async getMyRewardDashboard(userId: string) {
    const setting = await this.getSetting();
    const ownerId = new Types.ObjectId(userId);
    const since = periodStartDate(setting.periodDays);

    const [allTimeStats, periodStats, netFollowers, diamondBalance, coinSetting] = await Promise.all([
      ReelModel.aggregate([
        { $match: { ownerId, status: ReelStatus.READY, visibility: ReelVisibility.PUBLIC, deletedAt: { $exists: false } } },
        {
          $group: {
            _id: null,
            postViews: { $sum: '$viewCount' },
            likes: { $sum: '$likeCount' },
            comments: { $sum: '$commentCount' },
            shares: { $sum: '$shareCount' },
          },
        },
      ]).exec(),
      ReelModel.aggregate([
        {
          $match: {
            ownerId,
            status: ReelStatus.READY,
            visibility: ReelVisibility.PUBLIC,
            deletedAt: { $exists: false },
            publishedAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: null,
            postViews: { $sum: '$viewCount' },
            likes: { $sum: '$likeCount' },
          },
        },
      ]).exec(),
      FollowModel.countDocuments({ followingId: ownerId, createdAt: { $gte: since } }).exec(),
      coinRepository.getUserDiamondBalance(userId),
      coinRepository.getCoinSettings(),
    ]);

    const totals = allTimeStats[0] ?? {};
    const recent = periodStats[0] ?? {};

    return {
      period: `${setting.periodDays}d`,
      postViews: totals.postViews ?? 0,
      netFollowers,
      likes: totals.likes ?? 0,
      comments: totals.comments ?? 0,
      shares: totals.shares ?? 0,
      periodStats: {
        postViews: recent.postViews ?? 0,
        likes: recent.likes ?? 0,
        netFollowers,
      },
      giftDiamonds: diamondBalance,
      estimatedEarningsUsd: Number((diamondBalance / coinSetting.coinsPerDollar).toFixed(2)),
      diamondsPerDollar: coinSetting.coinsPerDollar,
    };
  }

  async getTrendingCreators(viewerId?: string) {
    const setting = await this.getSetting();
    const viewerObjectId = viewerId && Types.ObjectId.isValid(viewerId) ? new Types.ObjectId(viewerId) : undefined;
    const ranked = await this.calculateLeaderboard(setting, setting.leaderboardLimit);
    const creatorIds = ranked.map((row) => row._id as Types.ObjectId);
    const [followers, followed] = await Promise.all([
      FollowModel.aggregate([
        { $match: { followingId: { $in: creatorIds } } },
        { $group: { _id: '$followingId', count: { $sum: 1 } } },
      ]).exec(),
      viewerObjectId
        ? FollowModel.find({ followerId: viewerObjectId, followingId: { $in: creatorIds } })
            .select('followingId')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const followersByUser = new Map(followers.map((row) => [String(row._id), row.count as number]));
    const followedIds = new Set(followed.map((row: any) => String(row.followingId)));

    if (ranked.length > 0) {
      return ranked.map((row, index) => ({
        rank: index + 1,
        id: String(row._id),
        name: displayNameOf(row.user),
        avatarUrl: avatarOf(row.user),
        postViews: row.postViews ?? 0,
        likes: row.likes ?? 0,
        followersCount: followersByUser.get(String(row._id)) ?? 0,
        isFollowing: followedIds.has(String(row._id)),
      }));
    }

    const fallbackUsers = await UserModel.find({ status: AccountStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .limit(setting.leaderboardLimit)
      .select('_id email profile.displayName profile.username profile.photoUrl')
      .lean()
      .exec();

    return fallbackUsers.map((user, index) => ({
      rank: index + 1,
      id: String(user._id),
      name: displayNameOf(user),
      avatarUrl: avatarOf(user),
      postViews: 0,
      likes: 0,
      followersCount: followersByUser.get(String(user._id)) ?? 0,
      isFollowing: followedIds.has(String(user._id)),
    }));
  }

  async getAdminDashboard() {
    const [settings, programs, winners, leaderboard] = await Promise.all([
      this.getSetting(),
      this.listPrograms(),
      this.listWinners(),
      this.getAdminLeaderboard(),
    ]);

    return {
      settings: mapSetting(settings),
      programs,
      winners,
      leaderboard,
    };
  }

  async getAdminLeaderboard() {
    const setting = await this.getSetting();
    const rows = await this.calculateLeaderboard(setting, setting.leaderboardLimit);
    return rows.map((row, index) => ({
      rank: index + 1,
      id: String(row._id),
      name: displayNameOf(row.user),
      email: row.user?.email,
      avatarUrl: avatarOf(row.user),
      followers: row.followersCount ?? 0,
      likes: row.likes ?? 0,
      engagement: calculateEngagement(row),
      score: Math.round(row.score ?? 0),
    }));
  }

  async updateSettings(adminUserId: string, input: UpdateRewardSettingsInput) {
    const setting = await RewardSettingModel.findOneAndUpdate(
      {},
      { $set: { ...input, updatedBy: new Types.ObjectId(adminUserId) } },
      { new: true, upsert: true, runValidators: true },
    ).exec();
    return mapSetting(setting);
  }

  async listPrograms() {
    const programs = await RewardProgramModel.find().sort({ sortOrder: 1, createdAt: -1 }).lean().exec();
    return programs.map(mapProgram);
  }

  async createProgram(adminUserId: string, input: CreateRewardProgramInput) {
    const program = await RewardProgramModel.create({ ...input, updatedBy: new Types.ObjectId(adminUserId) });
    return mapProgram(program);
  }

  async updateProgram(adminUserId: string, programId: string, input: UpdateRewardProgramInput) {
    const program = await RewardProgramModel.findByIdAndUpdate(
      programId,
      { $set: { ...input, updatedBy: new Types.ObjectId(adminUserId) } },
      { new: true, runValidators: true },
    ).lean().exec();
    if (!program) throw new NotFoundError('Reward program was not found.');
    return mapProgram(program);
  }

  async finalizeWinners(adminUserId: string, input: FinalizeRewardWinnersInput) {
    const setting = await this.getSetting();
    const limit = input.limit ?? setting.leaderboardLimit;
    const rows = await this.calculateLeaderboard(setting, limit);
    const program = input.programId ? await RewardProgramModel.findById(input.programId).lean().exec() : null;
    const cycleLabel = input.cycleLabel || String(new Date().getFullYear());
    const reward = program?.reward || 'Creator reward';

    const created = await RewardWinnerModel.insertMany(
      rows.map((row, index) => ({
        userId: row._id,
        programId: program?._id,
        rank: index + 1,
        score: Math.round(row.score ?? 0),
        reward,
        cycleLabel,
        status: 'pending',
        finalizedBy: new Types.ObjectId(adminUserId),
        finalizedAt: new Date(),
      })),
      { ordered: true },
    );

    return created.map((winner) => ({
      id: winner._id.toString(),
      year: winner.cycleLabel,
      winner: '',
      reward: winner.reward,
      status: winner.status,
      rank: winner.rank,
      score: winner.score,
    }));
  }

  async listWinners() {
    const winners = await RewardWinnerModel.find()
      .sort({ finalizedAt: -1, rank: 1 })
      .limit(100)
      .populate('userId', 'email profile.displayName profile.username profile.photoUrl')
      .lean()
      .exec();
    return winners.map(mapWinner);
  }

  async updateWinnerStatus(adminUserId: string, winnerId: string, input: UpdateRewardWinnerStatusInput) {
    const winner = await RewardWinnerModel.findByIdAndUpdate(
      winnerId,
      {
        $set: {
          status: input.status,
          reviewedBy: new Types.ObjectId(adminUserId),
          reviewedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).populate('userId', 'email profile.displayName profile.username profile.photoUrl').lean().exec();

    if (!winner) throw new NotFoundError('Reward winner was not found.');
    return mapWinner(winner);
  }

  private async getSetting() {
    let setting = await RewardSettingModel.findOne().exec();
    if (!setting) setting = await RewardSettingModel.create({});
    return setting;
  }

  private async calculateLeaderboard(setting: RewardSetting, limit: number) {
    return ReelModel.aggregate([
      {
        $match: {
          status: ReelStatus.READY,
          visibility: ReelVisibility.PUBLIC,
          deletedAt: { $exists: false },
          publishedAt: { $gte: periodStartDate(setting.periodDays) },
        },
      },
      {
        $group: {
          _id: '$ownerId',
          postViews: { $sum: '$viewCount' },
          likes: { $sum: '$likeCount' },
          comments: { $sum: '$commentCount' },
          shares: { $sum: '$shareCount' },
        },
      },
      { $lookup: { from: 'follows', localField: '_id', foreignField: 'followingId', as: 'followers' } },
      {
        $addFields: {
          followersCount: { $size: '$followers' },
          score: {
            $add: [
              { $multiply: ['$postViews', setting.viewsWeight] },
              { $multiply: ['$likes', setting.likesWeight] },
              { $multiply: ['$comments', setting.commentsWeight] },
              { $multiply: ['$shares', setting.sharesWeight] },
              { $multiply: [{ $size: '$followers' }, setting.followersWeight] },
            ],
          },
        },
      },
      { $sort: { score: -1, postViews: -1 } },
      { $limit: limit },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
    ]).exec();
  }
}

export const rewardService = new RewardService();

function periodStartDate(days = DEFAULT_REWARD_PERIOD_DAYS) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function mapSetting(setting: RewardSetting) {
  return {
    periodDays: setting.periodDays,
    leaderboardLimit: setting.leaderboardLimit,
    viewsWeight: setting.viewsWeight,
    likesWeight: setting.likesWeight,
    commentsWeight: setting.commentsWeight,
    sharesWeight: setting.sharesWeight,
    followersWeight: setting.followersWeight,
    isActive: setting.isActive,
  };
}

function mapProgram(program: any) {
  return {
    id: program._id.toString(),
    name: program.name,
    reward: program.reward,
    eligibilityCriteria: program.eligibilityCriteria,
    cycle: program.cycle,
    isActive: program.isActive,
    sortOrder: program.sortOrder,
  };
}

function mapWinner(winner: any) {
  return {
    id: winner._id.toString(),
    year: winner.cycleLabel,
    winner: displayNameOf(winner.userId),
    reward: winner.reward,
    status: winner.status,
    rank: winner.rank,
    score: winner.score,
  };
}

function calculateEngagement(row: any) {
  const views = Number(row.postViews ?? 0);
  if (views <= 0) return 0;
  const total = Number(row.likes ?? 0) + Number(row.comments ?? 0) + Number(row.shares ?? 0);
  return Number(((total / views) * 100).toFixed(1));
}
