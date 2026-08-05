import type { Types } from 'mongoose';

import type { EngagementTargetType } from './like.model.js';
import { LikeModel } from './like.model.js';
import { SaveModel } from './save.model.js';
import { ShareModel, type ShareChannel } from './share.model.js';

export interface ViewerEngagementState {
  isLiked: boolean;
  isSaved: boolean;
}

export class EngagementRepository {
  // ── Like ────────────────────────────────────────────────────────────────

  async insertLike(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean> {
    try {
      await LikeModel.create({ userId, targetType, targetId });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  async deleteLike(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean> {
    const result = await LikeModel.deleteOne({ userId, targetType, targetId }).exec();
    return result.deletedCount === 1;
  }

  async isLiked(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean> {
    const doc = await LikeModel.exists({ userId, targetType, targetId }).exec();
    return doc !== null;
  }

  async getBulkLikedByUser(
    userId: string,
    targetType: EngagementTargetType,
    targetIds: string[],
  ): Promise<Set<string>> {
    const docs = await LikeModel.find({
      userId,
      targetType,
      targetId: { $in: targetIds },
    })
      .select('targetId')
      .lean()
      .exec();

    return new Set(docs.map((d) => d.targetId.toString()));
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async insertSave(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean> {
    try {
      await SaveModel.create({ userId, targetType, targetId });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  async deleteSave(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean> {
    const result = await SaveModel.deleteOne({ userId, targetType, targetId }).exec();
    return result.deletedCount === 1;
  }

  async isSaved(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<boolean> {
    const doc = await SaveModel.exists({ userId, targetType, targetId }).exec();
    return doc !== null;
  }

  async getBulkSavedByUser(
    userId: string,
    targetType: EngagementTargetType,
    targetIds: string[],
  ): Promise<Set<string>> {
    const docs = await SaveModel.find({
      userId,
      targetType,
      targetId: { $in: targetIds },
    })
      .select('targetId')
      .lean()
      .exec();

    return new Set(docs.map((d) => d.targetId.toString()));
  }

  async listSavedByUser(
    userId: string,
    targetType: EngagementTargetType,
    limit: number,
    cursor?: { createdAt: Date; id: Types.ObjectId },
  ): Promise<Array<{ targetId: Types.ObjectId; createdAt: Date }>> {
    const filter: Record<string, unknown> = { userId, targetType };

    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    return SaveModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select('targetId createdAt')
      .lean()
      .exec();
  }

  // ── Share ───────────────────────────────────────────────────────────────

  async insertShare(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
    channel: ShareChannel,
  ): Promise<void> {
    await ShareModel.create({ userId, targetType, targetId, channel });
  }

  // ── Bulk viewer state ───────────────────────────────────────────────────

  async getViewerState(
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<ViewerEngagementState> {
    const [isLiked, isSaved] = await Promise.all([
      this.isLiked(userId, targetType, targetId),
      this.isSaved(userId, targetType, targetId),
    ]);

    return { isLiked, isSaved };
  }

  async getBulkViewerState(
    userId: string,
    targetType: EngagementTargetType,
    targetIds: string[],
  ): Promise<Map<string, ViewerEngagementState>> {
    const [likedSet, savedSet] = await Promise.all([
      this.getBulkLikedByUser(userId, targetType, targetIds),
      this.getBulkSavedByUser(userId, targetType, targetIds),
    ]);

    const result = new Map<string, ViewerEngagementState>();

    for (const id of targetIds) {
      result.set(id, { isLiked: likedSet.has(id), isSaved: savedSet.has(id) });
    }

    return result;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11_000
  );
}

export const engagementRepository = new EngagementRepository();
