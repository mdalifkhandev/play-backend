import type { ClientSession, Types } from 'mongoose';

import { ReelQueueSubmissionState, ReelStatus, ReelVisibility } from './reel.constants.js';
import type { ReelCursor } from './reel-cursor.js';
import type { ReelWithOwner } from './reel.mapper.js';
import {
  ReelModel,
  type CreateReelRecord,
  type ReelDocument,
  type ReelProcessedMediaSnapshot,
  type ReelThumbnailSnapshot,
} from './reel.model.js';

const OWNER_PROJECTION = '_id profile.displayName profile.username profile.photoUrl';

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
      status: { $in: [ReelStatus.READY, ReelStatus.QUEUED, ReelStatus.PROCESSING, 'READY'] },
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
}

export const reelRepository = new ReelRepository();
