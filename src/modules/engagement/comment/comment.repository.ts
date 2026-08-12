import type { Types } from 'mongoose';

import { CommentModel, type CommentDocument, type CreateCommentRecord } from './comment.model.js';

export interface CommentCursor {
  createdAt: Date;
  id: Types.ObjectId;
}

export class CommentRepository {
  async create(input: CreateCommentRecord): Promise<CommentDocument> {
    return CommentModel.create(input);
  }

  async findById(commentId: string): Promise<CommentDocument | null> {
    return CommentModel.findOne({ _id: commentId, status: 'active' }).exec();
  }

  async listForTarget(
    targetType: string,
    targetId: string,
    limit: number,
    cursor?: CommentCursor,
  ): Promise<CommentDocument[]> {
    const filter: Record<string, unknown> = {
      targetType,
      targetId,
      status: 'active',
      parentCommentId: { $exists: false },
    };

    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    return CommentModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'authorId', select: '_id profile.displayName profile.username profile.photoUrl' })
      .exec();
  }

  async countForTarget(targetType: string, targetId: string): Promise<number> {
    return CommentModel.countDocuments()
      .where('targetType')
      .equals(targetType)
      .where('targetId')
      .equals(targetId)
      .where('status')
      .equals('active')
      .where('parentCommentId')
      .exists(false)
      .exec();
  }

  async countForTargets(targetType: string, targetIds: string[]): Promise<Map<string, number>> {
    if (targetIds.length === 0) {
      return new Map();
    }

    const rows = await Promise.all(
      targetIds.map(async (targetId) => ({
        targetId,
        count: await this.countForTarget(targetType, targetId),
      })),
    );

    return new Map(rows.map((row) => [row.targetId, row.count]));
  }

  async listReplies(
    parentCommentId: string,
    limit: number,
    cursor?: CommentCursor,
  ): Promise<CommentDocument[]> {
    const filter: Record<string, unknown> = {
      parentCommentId,
      status: 'active',
    };

    if (cursor) {
      filter.$or = [
        { createdAt: { $gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $gt: cursor.id } },
      ];
    }

    return CommentModel.find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .populate({ path: 'authorId', select: '_id profile.displayName profile.username profile.photoUrl' })
      .exec();
  }

  async updateText(commentId: string, authorId: string, text: string): Promise<CommentDocument | null> {
    return CommentModel.findOneAndUpdate(
      { _id: commentId, authorId, status: 'active' },
      { $set: { text } },
      { returnDocument: 'after' },
    ).exec();
  }

  async softDelete(commentId: string, authorId: string): Promise<boolean> {
    const result = await CommentModel.updateOne(
      { _id: commentId, authorId, status: 'active' },
      { $set: { status: 'deleted', deletedAt: new Date() } },
    ).exec();

    return result.modifiedCount === 1;
  }

  async incrementReplyCount(parentCommentId: Types.ObjectId, delta: 1 | -1): Promise<void> {
    await CommentModel.updateOne(
      { _id: parentCommentId, status: 'active' },
      { $inc: { replyCount: delta } },
    ).exec();
  }
}

export const commentRepository = new CommentRepository();
