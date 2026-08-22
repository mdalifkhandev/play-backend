import { Types } from 'mongoose';

import { ReelModel } from '../reels/reel.model.js';
import { ReelStatus, ReelVisibility } from '../reels/reel.constants.js';
import { FollowModel } from '../users/follow.model.js';
import { UserModel } from '../users/user.model.js';
import { coinRepository } from '../coins/coin.repository.js';
import { AccountStatus } from '../../common/enums/account-status.enum.js';

const REWARD_PERIOD_DAYS = 7;

function periodStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - REWARD_PERIOD_DAYS);
  return date;
}

function displayNameOf(user: any) {
  return user?.profile?.displayName || user?.profile?.username || user?.email || 'Creator';
}

function avatarOf(user: any) {
  return user?.profile?.photoUrl;
}

export class RewardService {
  async getMyRewardDashboard(userId: string) {
    const ownerId = new Types.ObjectId(userId);
    const since = periodStartDate();

    const [allTimeStats, periodStats, netFollowers, diamondBalance, setting] = await Promise.all([
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
      period: `${REWARD_PERIOD_DAYS}d`,
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
      estimatedEarningsUsd: Number((diamondBalance / setting.coinsPerDollar).toFixed(2)),
      diamondsPerDollar: setting.coinsPerDollar,
    };
  }

  async getTrendingCreators(viewerId?: string) {
    const viewerObjectId = viewerId && Types.ObjectId.isValid(viewerId) ? new Types.ObjectId(viewerId) : undefined;
    const since = periodStartDate();

    const ranked = await ReelModel.aggregate([
      {
        $match: {
          status: ReelStatus.READY,
          visibility: ReelVisibility.PUBLIC,
          deletedAt: { $exists: false },
          publishedAt: { $gte: since },
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
      {
        $addFields: {
          score: {
            $add: [
              '$postViews',
              { $multiply: ['$likes', 3] },
              { $multiply: ['$comments', 5] },
              { $multiply: ['$shares', 6] },
            ],
          },
        },
      },
      { $sort: { score: -1, postViews: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
    ]).exec();

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
      .limit(10)
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
}

export const rewardService = new RewardService();
