import { Types, type ClientSession, type PipelineStage } from 'mongoose';

import { ReelQueueSubmissionState, ReelStatus, ReelVisibility } from './reel.constants.js';
import type { ReelCursor } from './reel-cursor.js';
import type { ReelForYouCursor } from './reel-for-you-cursor.js';
import type { ReelWithOwner } from './reel.mapper.js';
import {
  ReelModel,
  type CreateReelRecord,
  type ReelDocument,
  type ReelProcessedMediaSnapshot,
  type ReelThumbnailSnapshot,
} from './reel.model.js';
import { ReelViewModel } from './reel-view.model.js';

const OWNER_PROJECTION = '_id email profile.displayName profile.username profile.photoUrl';
const FOR_YOU_REPORT_THRESHOLD = 3;

export interface ReelPreferenceSignals {
  hashtags: string[];
  ownerIds: Types.ObjectId[];
}

export interface RankedReel {
  reel: ReelWithOwner;
  score: number;
}

export class ReelRepository {
  async create(input: CreateReelRecord, session: ClientSession): Promise<ReelDocument> {
    const created = await ReelModel.create([input], { session });
    const reel = created[0];

    if (!reel) {
      throw new Error('Reel creation did not return a document.');
    }

    return reel;
  }

  async findById(
    reelId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<ReelDocument | null> {
    const query = ReelModel.findById(reelId).select('+audioEdit.music.audioSourceUrl');
    if (session) query.session(session);
    return query.exec();
  }

  async findByIdForOwner(
    reelId: string,
    ownerId: string,
  ): Promise<ReelDocument | null> {
    return ReelModel.findOne({ _id: reelId, ownerId }).exec();
  }

  async findViewableById(reelId: string): Promise<ReelDocument | null> {
    return ReelModel.findOne()
      .where('_id')
      .equals(reelId)
      .where('status')
      .in([ReelStatus.READY, ReelStatus.QUEUED, ReelStatus.PROCESSING, 'READY'])
      .where('visibility')
      .in([ReelVisibility.PUBLIC, 'PUBLIC'])
      .where('deletedAt')
      .exists(false)
      .exec();
  }

  async findByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<ReelDocument | null> {
    const query = ReelModel.findOne({ ownerId, idempotencyKey }).select(
      '+idempotencyKey +requestHash',
    );
    if (session) query.session(session);
    return query.exec();
  }

  async listReadyPublic(limit: number, cursor?: ReelCursor, hashtag?: string): Promise<ReelWithOwner[]> {
    const filter: Record<string, unknown> = {
      status: ReelStatus.READY,
      visibility: ReelVisibility.PUBLIC,
      deletedAt: { $exists: false },
      ...(hashtag ? { hashtags: hashtag.toLowerCase() } : {}),
      ...(cursor
        ? {
            $or: [
              { createdAt: { $lt: cursor.publishedAt } },
              { createdAt: cursor.publishedAt, _id: { $lt: cursor.id } },
            ],
          }
        : {}),
    };

    return ReelModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'ownerId', select: OWNER_PROJECTION })
      .lean<ReelWithOwner[]>()
      .exec();
  }

  async listKidsReadyPublic(
    limit: number,
    cursor?: ReelCursor,
    hashtag?: string,
    excludedReelIds: Types.ObjectId[] = [],
  ): Promise<ReelWithOwner[]> {
    const filter: Record<string, unknown> = {
      forKids: true,
      status: ReelStatus.READY,
      visibility: ReelVisibility.PUBLIC,
      mediaType: 'video',
      reportCount: { $lt: FOR_YOU_REPORT_THRESHOLD },
      deletedAt: { $exists: false },
      ...(hashtag ? { hashtags: hashtag.toLowerCase() } : {}),
      ...(excludedReelIds.length > 0 ? { _id: { $nin: excludedReelIds } } : {}),
      ...(cursor
        ? {
            $or: [
              { createdAt: { $lt: cursor.publishedAt } },
              { createdAt: cursor.publishedAt, _id: { $lt: cursor.id } },
            ],
          }
        : {}),
    };

    return ReelModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'ownerId', select: OWNER_PROJECTION })
      .lean<ReelWithOwner[]>()
      .exec();
  }

  async search(query: string, limit: number, skip: number): Promise<ReelWithOwner[]> {
    const searchRegex = new RegExp(query, 'i');
    return ReelModel.find({
      status: ReelStatus.READY,
      visibility: ReelVisibility.PUBLIC,
      caption: searchRegex,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'ownerId', select: OWNER_PROJECTION })
      .lean<ReelWithOwner[]>()
      .exec();
  }

  async listForYou(
    limit: number,
    asOf: Date,
    cursor?: ReelForYouCursor,
    excludedReelIds: Types.ObjectId[] = [],
    deprioritizedReelIds: Types.ObjectId[] = [],
    preferences: ReelPreferenceSignals = { hashtags: [], ownerIds: [] },
  ): Promise<RankedReel[]> {
    const publishedAtExpression = { $ifNull: ['$publishedAt', '$createdAt'] };
    const ageHoursExpression = {
      $max: [
        0,
        { $divide: [{ $subtract: [asOf, publishedAtExpression] }, 3_600_000] },
      ],
    };
    const scoreExpression = {
      $round: [
        {
          $add: [
            { $multiply: [{ $ln: { $add: [{ $ifNull: ['$viewCount', 0] }, 1] } }, 1.2] },
            { $multiply: [{ $ln: { $add: [{ $ifNull: ['$likeCount', 0] }, 1] } }, 4] },
            { $multiply: [{ $ln: { $add: [{ $ifNull: ['$commentCount', 0] }, 1] } }, 6] },
            { $multiply: [{ $ln: { $add: [{ $ifNull: ['$shareCount', 0] }, 1] } }, 9] },
            { $max: [0, { $subtract: [14, { $divide: [ageHoursExpression, 12] }] }] },
            {
              $multiply: [
                {
                  $size: {
                    $setIntersection: [{ $ifNull: ['$hashtags', []] }, preferences.hashtags],
                  },
                },
                3,
              ],
            },
            { $cond: [{ $in: ['$ownerId', preferences.ownerIds] }, 4, 0] },
            { $cond: [{ $in: ['$_id', deprioritizedReelIds] }, -20, 0] },
          ],
        },
        6,
      ],
    };
    const pipeline: PipelineStage[] = [
      {
        $match: {
          status: ReelStatus.READY,
          visibility: ReelVisibility.PUBLIC,
          mediaType: 'video',
          deletedAt: { $exists: false },
          $expr: {
            $lt: [{ $ifNull: ['$reportCount', 0] }, FOR_YOU_REPORT_THRESHOLD],
          },
          ...(excludedReelIds.length > 0 ? { _id: { $nin: excludedReelIds } } : {}),
        },
      },
      {
        $addFields: {
          forYouPublishedAt: publishedAtExpression,
          forYouScore: scoreExpression,
        },
      },
      ...(cursor
        ? [
            {
              $match: {
                $or: [
                  { forYouScore: { $lt: cursor.score } },
                  {
                    forYouScore: cursor.score,
                    forYouPublishedAt: { $lt: cursor.publishedAt },
                  },
                  {
                    forYouScore: cursor.score,
                    forYouPublishedAt: cursor.publishedAt,
                    _id: { $lt: cursor.id },
                  },
                ],
              },
            } as PipelineStage.Match,
          ]
        : []),
      { $sort: { forYouScore: -1, forYouPublishedAt: -1, _id: -1 } },
      { $limit: limit },
      { $project: { _id: 1, forYouScore: 1 } },
    ];
    const rankedIds = await ReelModel.aggregate<{
      _id: Types.ObjectId;
      forYouScore: number;
    }>(pipeline).exec();

    if (rankedIds.length === 0) return [];

    const reels = await ReelModel.find({ _id: { $in: rankedIds.map((item) => item._id) } })
      .populate({ path: 'ownerId', select: OWNER_PROJECTION })
      .lean<ReelWithOwner[]>()
      .exec();
    const reelsById = new Map(reels.map((reel) => [reel._id.toString(), reel]));

    return rankedIds.flatMap((ranked) => {
      const reel = reelsById.get(ranked._id.toString());
      return reel ? [{ reel, score: ranked.forYouScore }] : [];
    });
  }

  async listRecentlyViewedReelIds(viewerId: string, limit = 500): Promise<Types.ObjectId[]> {
    const views = await ReelViewModel.find({ viewerId })
      .sort({ viewedAt: -1 })
      .limit(limit)
      .select('reelId')
      .lean<Array<{ reelId: Types.ObjectId }>>()
      .exec();

    return views.map((view) => view.reelId);
  }

  async getPreferenceSignals(reelIds: Types.ObjectId[]): Promise<ReelPreferenceSignals> {
    if (reelIds.length === 0) return { hashtags: [], ownerIds: [] };

    const reels = await ReelModel.find({ _id: { $in: reelIds } })
      .select('ownerId hashtags')
      .lean<Array<{ ownerId: Types.ObjectId; hashtags?: string[] }>>()
      .exec();
    const hashtagCounts = new Map<string, number>();
    const ownerCounts = new Map<string, { id: Types.ObjectId; count: number }>();

    for (const reel of reels) {
      const ownerKey = reel.ownerId.toString();
      const owner = ownerCounts.get(ownerKey);
      ownerCounts.set(ownerKey, { id: reel.ownerId, count: (owner?.count ?? 0) + 1 });

      for (const hashtag of reel.hashtags ?? []) {
        hashtagCounts.set(hashtag, (hashtagCounts.get(hashtag) ?? 0) + 1);
      }
    }

    return {
      hashtags: [...hashtagCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 20)
        .map(([hashtag]) => hashtag),
      ownerIds: [...ownerCounts.values()]
        .sort((left, right) => right.count - left.count)
        .slice(0, 20)
        .map((owner) => owner.id),
    };
  }

  async listPublicByOwner(
    ownerId: string,
    limit: number,
    cursor?: ReelCursor,
  ): Promise<ReelWithOwner[]> {
    const filter: Record<string, unknown> = {
      ownerId,
      status: { $in: [ReelStatus.READY, ReelStatus.QUEUED, ReelStatus.PROCESSING, 'READY'] },
      visibility: ReelVisibility.PUBLIC,
      deletedAt: { $exists: false },
      ...(cursor
        ? {
            $or: [
              { createdAt: { $lt: cursor.publishedAt } },
              { createdAt: cursor.publishedAt, _id: { $lt: cursor.id } },
            ],
          }
        : {}),
    };

    return ReelModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'ownerId', select: OWNER_PROJECTION })
      .lean<ReelWithOwner[]>()
      .exec();
  }

  async markQueueSubmitted(
    reelId: Types.ObjectId,
    jobId: string,
  ): Promise<ReelDocument | null> {
    return ReelModel.findOneAndUpdate(
      {
        _id: reelId,
        status: { $in: [ReelStatus.QUEUED, ReelStatus.FAILED] },
      },
      {
        $set: {
          'processing.jobId': jobId,
          'processing.queueSubmissionState': ReelQueueSubmissionState.SUBMITTED,
          'processing.lastEnqueuedAt': new Date(),
          status: ReelStatus.QUEUED,
          progress: 0,
        },
        $unset: {
          'processing.failedAt': 1,
          'processing.errorCode': 1,
          'processing.errorMessage': 1,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  async markQueueSubmissionFailed(reelId: Types.ObjectId): Promise<void> {
    await ReelModel.updateOne(
      { _id: reelId },
      {
        $set: {
          'processing.queueSubmissionState': ReelQueueSubmissionState.FAILED,
          'processing.errorCode': 'REEL_QUEUE_SUBMISSION_FAILED',
          'processing.errorMessage': 'Processing queue is temporarily unavailable.',
        },
      },
    ).exec();
  }

  async claimForProcessing(reelId: string): Promise<ReelDocument | null> {
    return ReelModel.findOneAndUpdate(
      {
        _id: reelId,
        status: ReelStatus.QUEUED,
        'processing.cancelRequested': false,
        deletedAt: { $exists: false },
      },
      {
        $set: {
          status: ReelStatus.PROCESSING,
          progress: 5,
          'processing.startedAt': new Date(),
        },
        $inc: { 'processing.attempts': 1 },
        $unset: {
          'processing.failedAt': 1,
          'processing.errorCode': 1,
          'processing.errorMessage': 1,
        },
      },
      { returnDocument: 'after' },
    )
      .select('+audioEdit.music.audioSourceUrl')
      .exec();
  }

  async updateProgress(reelId: Types.ObjectId, progress: number): Promise<void> {
    await ReelModel.updateOne(
      {
        _id: reelId,
        status: ReelStatus.PROCESSING,
        progress: { $lt: progress },
      },
      { $set: { progress } },
    ).exec();
  }

  async markReady(
    reelId: Types.ObjectId,
    processedMedia: ReelProcessedMediaSnapshot,
    thumbnail: ReelThumbnailSnapshot,
  ): Promise<ReelDocument | null> {
    return ReelModel.findOneAndUpdate(
      {
        _id: reelId,
        status: ReelStatus.PROCESSING,
        'processing.cancelRequested': false,
      },
      {
        $set: {
          status: ReelStatus.READY,
          progress: 100,
          processedMedia,
          thumbnail,
          publishedAt: new Date(),
          'processing.completedAt': new Date(),
          'processing.queueSubmissionState': ReelQueueSubmissionState.SUBMITTED,
        },
        $unset: {
          'processing.failedAt': 1,
          'processing.errorCode': 1,
          'processing.errorMessage': 1,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  async markFailed(
    reelId: Types.ObjectId,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    await ReelModel.updateOne(
      {
        _id: reelId,
        status: { $in: [ReelStatus.QUEUED, ReelStatus.PROCESSING] },
      },
      {
        $set: {
          status: ReelStatus.FAILED,
          'processing.failedAt': new Date(),
          'processing.errorCode': errorCode,
          'processing.errorMessage': errorMessage.slice(0, 300),
        },
      },
    ).exec();
  }

  async prepareRetry(reelId: string, ownerId: string): Promise<ReelDocument | null> {
    return ReelModel.findOneAndUpdate(
      {
        _id: reelId,
        ownerId,
        $or: [
          { status: ReelStatus.FAILED },
          { 'processing.queueSubmissionState': ReelQueueSubmissionState.FAILED },
        ],
        deletedAt: { $exists: false },
      },
      {
        $set: {
          status: ReelStatus.QUEUED,
          progress: 0,
          'processing.queueSubmissionState': ReelQueueSubmissionState.PENDING,
          'processing.cancelRequested': false,
        },
        $inc: { 'processing.retryCount': 1 },
        $unset: {
          'processing.failedAt': 1,
          'processing.errorCode': 1,
          'processing.errorMessage': 1,
          'processing.startedAt': 1,
          'processing.completedAt': 1,
          processedMedia: 1,
          thumbnail: 1,
          publishedAt: 1,
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  async markDeleted(reelId: Types.ObjectId, deletedAt: Date, session: ClientSession): Promise<void> {
    await ReelModel.updateOne(
      { _id: reelId },
      {
        $set: {
          status: ReelStatus.DELETED,
          deletedAt,
          'processing.cancelRequested': true,
        },
      },
      { session },
    ).exec();
  }

  async findQueueRecoveryCandidates(limit: number): Promise<ReelDocument[]> {
    return ReelModel.find({
      deletedAt: { $exists: false },
      status: ReelStatus.QUEUED,
      'processing.queueSubmissionState': {
        $in: [ReelQueueSubmissionState.PENDING, ReelQueueSubmissionState.FAILED],
      },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  async findStaleProcessing(before: Date, limit: number): Promise<ReelDocument[]> {
    return ReelModel.find({
      status: ReelStatus.PROCESSING,
      'processing.startedAt': { $lte: before },
      deletedAt: { $exists: false },
    })
      .sort({ 'processing.startedAt': 1 })
      .limit(limit)
      .exec();
  }

  async findDeletedCleanupCandidates(limit: number): Promise<ReelDocument[]> {
    return ReelModel.find({
      status: ReelStatus.DELETED,
      $or: [{ processedMedia: { $exists: true } }, { thumbnail: { $exists: true } }],
    })
      .sort({ deletedAt: 1 })
      .limit(limit)
      .exec();
  }

  async clearProcessedAssets(reelId: Types.ObjectId): Promise<void> {
    await ReelModel.updateOne(
      { _id: reelId },
      { $unset: { processedMedia: 1, thumbnail: 1 } },
    ).exec();
  }

  async createViewIfAbsent(reelId: Types.ObjectId, viewerId: string): Promise<boolean> {
    const existing = await ReelViewModel.exists({ reelId, viewerId }).exec();

    if (existing) {
      return false;
    }

    try {
      await ReelViewModel.create({ reelId, viewerId });
      return true;
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  async incrementViewCount(reelId: Types.ObjectId): Promise<number> {
    const reel = await ReelModel.findByIdAndUpdate(
      reelId,
      { $inc: { viewCount: 1 } },
      { new: true },
    )
      .select('viewCount')
      .lean<{ viewCount: number }>()
      .exec();

    return reel?.viewCount ?? 0;
  }
}

export const reelRepository = new ReelRepository();

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11_000
  );
}
