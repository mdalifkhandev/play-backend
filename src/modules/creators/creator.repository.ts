import { Types } from 'mongoose';

import { ReelStatus } from '../reels/reel.constants.js';
import { ReelModel } from '../reels/reel.model.js';
import { FollowModel } from '../users/follow.model.js';
import { UserModel } from '../users/user.model.js';
import {
  CreatorApplicationModel,
  type CreatorApplicationStatus,
} from './creator-application.model.js';
import type {
  AdminListCreatorApplicationsQuery,
  CreateCreatorApplicationInput,
} from './creator.validation.js';

export class CreatorRepository {
  findUser(userId: string) {
    return UserModel.findById(userId).exec();
  }

  countFollowers(userId: string) {
    return FollowModel.countDocuments({ followingId: userId }).exec();
  }

  async getReelStats(userId: string) {
    const [stats] = await ReelModel.aggregate<{
      reelsCount: number;
      totalViews: number;
      totalLikes: number;
      watchTimeMinutes: number;
      totalReports: number;
    }>([
      {
        $match: {
          ownerId: new Types.ObjectId(userId),
          status: ReelStatus.READY,
          deletedAt: { $exists: false },
        },
      },
      {
        $group: {
          _id: null,
          reelsCount: { $sum: 1 },
          totalViews: { $sum: '$viewCount' },
          totalLikes: { $sum: '$likeCount' },
          watchTimeMinutes: {
            $sum: {
              $divide: [{ $multiply: ['$viewCount', '$rawMedia.durationMs'] }, 60000],
            },
          },
          totalReports: { $sum: '$reportCount' },
        },
      },
    ]).exec();

    return {
      reelsCount: stats?.reelsCount ?? 0,
      totalViews: stats?.totalViews ?? 0,
      totalLikes: stats?.totalLikes ?? 0,
      watchTimeMinutes: Math.floor(stats?.watchTimeMinutes ?? 0),
      totalReports: stats?.totalReports ?? 0,
    };
  }

  findLatestApplication(userId: string) {
    return CreatorApplicationModel.findOne({ userId }).sort({ createdAt: -1 }).exec();
  }

  createApplication(userId: string, input: CreateCreatorApplicationInput) {
    return CreatorApplicationModel.create({
      userId: new Types.ObjectId(userId),
      fullName: input.fullName,
      email: input.email,
      contentCategory: input.contentCategory,
      contentLanguage: input.contentLanguage,
      country: input.country,
      reason: input.reason,
      ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
      ...(input.occupationId ? { occupationId: new Types.ObjectId(input.occupationId) } : {}),
      ...(input.occupation ? { occupation: input.occupation } : {}),
      ...(input.idFrontUrl ? { idFrontUrl: input.idFrontUrl } : {}),
      ...(input.idBackUrl ? { idBackUrl: input.idBackUrl } : {}),
      status: 'pending',
    });
  }

  listApplications(query: AdminListCreatorApplicationsQuery) {
    const filter: { status?: CreatorApplicationStatus } = {};
    if (query.status) filter.status = query.status;

    return CreatorApplicationModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .populate('userId', 'email role profile.displayName profile.username profile.photoUrl')
      .populate('occupationId', 'name')
      .populate('reviewedBy', 'email profile.displayName profile.username')
      .exec();
  }

  findApplicationById(id: string) {
    return CreatorApplicationModel.findById(id)
      .populate('userId', 'email role profile.displayName profile.username profile.photoUrl')
      .populate('occupationId', 'name')
      .populate('reviewedBy', 'email profile.displayName profile.username')
      .exec();
  }

  async updateApplicationStatus(
    id: string,
    status: CreatorApplicationStatus,
    reviewerId: string,
    reason?: string,
  ) {
    return CreatorApplicationModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status,
          ...(reason ? { adminReason: reason } : {}),
          reviewedBy: new Types.ObjectId(reviewerId),
          reviewedAt: new Date(),
        },
      },
      { new: true },
    ).exec();
  }

  markUserAsCreator(userId: string) {
    return UserModel.findByIdAndUpdate(userId, { $set: { role: 'creator' } }, { new: true }).exec();
  }
}

export const creatorRepository = new CreatorRepository();
