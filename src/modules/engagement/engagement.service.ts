import { Types } from 'mongoose';


import { AppError } from '../../common/errors/app-error.js';
import { ForbiddenError } from '../../common/errors/forbidden-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { ReelStatus, ReelVisibility } from '../reels/reel.constants.js';
import { ReelModel } from '../reels/reel.model.js';
import {
  toReelFeedItemDto,
  type ReelFeedItemDto,
  type ReelWithOwner,
} from '../reels/reel.mapper.js';
import { userRepository } from '../users/user.repository.js';
import { notificationService } from '../notifications/notification.service.js';
import { commentRepository, type CommentRepository } from './comment/comment.repository.js';
import { engagementRepository, type EngagementRepository } from './engagement.repository.js';
import type {
  CommentFeedQuery,
  CreateCommentInput,
  EditCommentInput,
  SavedFeedQuery,
  ShareInput,
} from './engagement.validation.js';
import type { EngagementTargetType } from './like.model.js';
import type { ShareChannel } from './share.model.js';
import { activityService } from '../activities/activity.service.js';

// ── Cursor helpers ─────────────────────────────────────────────────────────────

function encodeEngagementCursor(createdAt: Date, id: Types.ObjectId): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id: id.toString() }),
    'utf8',
  ).toString('base64url');
}

function decodeEngagementCursor(
  value: string,
): { createdAt: Date; id: Types.ObjectId } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = new Date(String(parsed.createdAt));
    const id = new Types.ObjectId(String(parsed.id));

    if (Number.isNaN(createdAt.getTime())) throw new Error('bad cursor');
    return { createdAt, id };
  } catch {
    throw new AppError('Cursor is invalid.', 400, { code: 'INVALID_CURSOR' });
  }
}

// ── Reel guard ─────────────────────────────────────────────────────────────────

async function requireEngageableReel(reelId: string): Promise<void> {
  const reel = await ReelModel.findOne()
    .where('_id')
    .equals(reelId)
    .where('status')
    .in([ReelStatus.READY, ReelStatus.QUEUED, ReelStatus.PROCESSING, 'READY'])
    .where('visibility')
    .in([ReelVisibility.PUBLIC, 'PUBLIC'])
    .where('deletedAt')
    .exists(false)
    .select('_id')
    .lean()
    .exec();

  if (!reel) {
    throw new NotFoundError('Reel was not found or is not available.', {
      code: 'REEL_NOT_FOUND',
    });
  }
}

async function listVisibleReelsByIds(ids: string[]): Promise<ReelWithOwner[]> {
  if (ids.length === 0) {
    return [];
  }

  return ReelModel.find()
    .where('_id')
    .in(ids)
    .where('status')
    .in([ReelStatus.READY, ReelStatus.QUEUED, ReelStatus.PROCESSING, 'READY'])
    .where('visibility')
    .in([ReelVisibility.PUBLIC, 'PUBLIC'])
    .where('deletedAt')
    .exists(false)
    .populate({ path: 'ownerId', select: '_id profile.displayName profile.username profile.photoUrl' })
    .lean<ReelWithOwner[]>()
    .exec();
}

async function atomicCounterUpdate(
  reelId: string,
  field: 'likeCount' | 'commentCount' | 'shareCount' | 'saveCount',
  delta: 1 | -1,
): Promise<void> {
  await ReelModel.updateOne({ _id: reelId }, { $inc: { [field]: delta } }).exec();
}

// ── Service ───────────────────────────────────────────────────────────────────

export class EngagementService {
  constructor(
    private readonly repo: EngagementRepository = engagementRepository,
    private readonly comments: CommentRepository = commentRepository,
  ) {}

  // ── Like ──────────────────────────────────────────────────────────────────

  async likeReel(userId: string, reelId: string): Promise<{ likeCount: number; isLiked: boolean }> {
    await requireEngageableReel(reelId);
    const inserted = await this.repo.insertLike(userId, 'reel', reelId);

    if (inserted) {
      await atomicCounterUpdate(reelId, 'likeCount', 1);
    }

    const reel = await ReelModel.findById(reelId).select('likeCount ownerId').lean().exec();

    if (inserted && reel && reel.ownerId.toString() !== userId) {
      console.log(`[DEBUG] likeReel: notification block entered for user ${userId} and owner ${reel.ownerId}`);
      const actor = await userRepository.findById(userId);
      console.log(`[DEBUG] likeReel: actor found? ${!!actor}`);
      if (actor) {
        const displayName = actor.profile?.displayName || actor.profile?.username || 'Someone';
        try {
          console.log(`[DEBUG] likeReel: creating notification in DB`);
          await notificationService.createNotification({
            userId: reel.ownerId,
            actorId: new Types.ObjectId(userId),
            type: 'like',
            title: 'New Like',
            body: `${displayName} liked your reel.`,
            relatedEntityId: new Types.ObjectId(reelId),
          });
          
          // Log Activity: like_received for owner
          activityService.logActivity({
            userId: reel.ownerId.toString(),
            actorId: userId,
            actionType: 'like_received',
            entityId: reelId,
            entityModel: 'Reel',
            metadata: { thumbnailUrl: (reel as any).thumbnail } 
          }).catch(console.error);
          
          console.log(`[DEBUG] likeReel: sending push notification to ${reel.ownerId}`);
          await notificationService.sendToUser(reel.ownerId.toString(), {
            title: 'New Like',
            body: `${displayName} liked your reel.`,
            data: { type: 'like', targetId: reelId },
          });
        } catch (error) {
          console.error('Failed to send like notification:', error);
        }
      }
    } else {
      console.log(`[DEBUG] likeReel: notification block SKIPPED. inserted=${inserted}, reelExists=${!!reel}, ownerId=${reel?.ownerId}, userId=${userId}`);
    }

    if (inserted) {
      // Log Activity: like_given for actor
      activityService.logActivity({
        userId,
        actionType: 'like_given',
        entityId: reelId,
        entityModel: 'Reel',
      }).catch(console.error);
    }

    return { likeCount: reel?.likeCount ?? 0, isLiked: true };
  }

  async unlikeReel(userId: string, reelId: string): Promise<{ likeCount: number; isLiked: boolean }> {
    await requireEngageableReel(reelId);
    const deleted = await this.repo.deleteLike(userId, 'reel', reelId);

    if (deleted) {
      await atomicCounterUpdate(reelId, 'likeCount', -1);
    }

    const reel = await ReelModel.findById(reelId).select('likeCount').lean().exec();
    return { likeCount: Math.max(0, reel?.likeCount ?? 0), isLiked: false };
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async saveReel(userId: string, reelId: string): Promise<{ isSaved: boolean }> {
    await requireEngageableReel(reelId);
    const inserted = await this.repo.insertSave(userId, 'reel', reelId);

    if (inserted) {
      await atomicCounterUpdate(reelId, 'saveCount', 1);
    }

    return { isSaved: true };
  }

  async unsaveReel(userId: string, reelId: string): Promise<{ isSaved: boolean }> {
    await requireEngageableReel(reelId);
    const deleted = await this.repo.deleteSave(userId, 'reel', reelId);

    if (deleted) {
      await atomicCounterUpdate(reelId, 'saveCount', -1);
    }

    return { isSaved: false };
  }

  async listSaved(
    userId: string,
    query: SavedFeedQuery,
  ): Promise<{
    items: Array<{ targetId: string; savedAt: string }>;
    nextCursor: string | null;
    hasNextPage: boolean;
  }> {
    const cursor = query.cursor ? decodeEngagementCursor(query.cursor) : undefined;
    const targetType: EngagementTargetType = query.type;
    const rows = await this.repo.listSavedByUser(userId, targetType, query.limit + 1, cursor);
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map((r) => ({
        targetId: r.targetId.toString(),
        savedAt: r.createdAt.toISOString(),
      })),
      nextCursor:
        hasNextPage && last
          ? encodeEngagementCursor(last.createdAt, last._id)
          : null,
      hasNextPage,
    };
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  async listSavedReels(
    userId: string,
    query: SavedFeedQuery,
  ): Promise<{
    items: ReelFeedItemDto[];
    nextCursor: string | null;
    pagination: { nextCursor: string | null; hasNextPage: boolean };
  }> {
    const cursor = query.cursor ? decodeEngagementCursor(query.cursor) : undefined;
    const rows = await this.repo.listSavedByUser(userId, 'reel', query.limit + 1, cursor);
    return this.mapEngagedReels(userId, rows, query.limit);
  }

  async listLikedReels(
    userId: string,
    query: SavedFeedQuery,
  ): Promise<{
    items: ReelFeedItemDto[];
    nextCursor: string | null;
    pagination: { nextCursor: string | null; hasNextPage: boolean };
  }> {
    const cursor = query.cursor ? decodeEngagementCursor(query.cursor) : undefined;
    const rows = await this.repo.listLikedByUser(userId, 'reel', query.limit + 1, cursor);
    return this.mapEngagedReels(userId, rows, query.limit);
  }

  private async mapEngagedReels(
    userId: string,
    rows: Array<{ _id: Types.ObjectId; targetId: Types.ObjectId; createdAt: Date }>,
    limit: number,
  ): Promise<{
    items: ReelFeedItemDto[];
    nextCursor: string | null;
    pagination: { nextCursor: string | null; hasNextPage: boolean };
  }> {
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    const ids = page.map((row) => row.targetId.toString());
    const reels = await listVisibleReelsByIds(ids);
    const reelById = new Map(reels.map((reel) => [reel._id.toString(), reel]));
    const viewerStateMap = await this.repo.getBulkViewerState(userId, 'reel', ids);
    const last = page.at(-1);
    const nextCursor =
      hasNextPage && last ? encodeEngagementCursor(last.createdAt, last._id) : null;

    return {
      items: ids
        .map((id) => {
          const reel = reelById.get(id);
          return reel ? toReelFeedItemDto(reel, viewerStateMap.get(id)) : null;
        })
        .filter((item): item is ReelFeedItemDto => item !== null),
      nextCursor,
      pagination: { nextCursor, hasNextPage },
    };
  }

  async shareReel(userId: string, reelId: string, input: ShareInput): Promise<{ shareCount: number }> {
    await requireEngageableReel(reelId);
    const inserted = await this.repo.insertShare(userId, 'reel', reelId, input.channel as ShareChannel);

    if (inserted) {
      await atomicCounterUpdate(reelId, 'shareCount', 1);
    }

    const reel = await ReelModel.findById(reelId).select('shareCount').lean().exec();
    return { shareCount: reel?.shareCount ?? 0 };
  }

  // ── Comment ───────────────────────────────────────────────────────────────

  async createComment(
    userId: string,
    reelId: string,
    input: CreateCommentInput,
  ): Promise<CommentDto> {
    await requireEngageableReel(reelId);

    if (input.parentCommentId) {
      const parent = await this.comments.findById(input.parentCommentId);

      if (!parent || parent.targetId.toString() !== reelId) {
        throw new NotFoundError('Parent comment was not found.', {
          code: 'COMMENT_NOT_FOUND',
        });
      }
    }

    const comment = await this.comments.create({
      targetType: 'reel',
      targetId: new Types.ObjectId(reelId),
      authorId: new Types.ObjectId(userId),
      ...(input.parentCommentId
        ? { parentCommentId: new Types.ObjectId(input.parentCommentId) }
        : {}),
      text: input.text,
      status: 'active',
    });

    if (input.parentCommentId) {
      await this.comments.incrementReplyCount(
        new Types.ObjectId(input.parentCommentId),
        1,
      );
    } else {
      await atomicCounterUpdate(reelId, 'commentCount', 1);
    }

    const reel = await ReelModel.findById(reelId).select('ownerId').lean().exec();

    if (reel && reel.ownerId.toString() !== userId) {
      const actor = await userRepository.findById(userId);
      if (actor) {
        const displayName = actor.profile?.displayName || actor.profile?.username || 'Someone';
        const shortText = input.text.length > 50 ? input.text.substring(0, 50) + '...' : input.text;
        try {
          await notificationService.createNotification({
            userId: reel.ownerId,
            actorId: new Types.ObjectId(userId),
            type: 'comment',
            title: 'New Comment',
            body: `${displayName} commented: "${shortText}"`,
            relatedEntityId: new Types.ObjectId(reelId),
          });
          
          activityService.logActivity({
            userId: reel.ownerId.toString(),
            actorId: userId,
            actionType: 'comment_received',
            entityId: reelId,
            entityModel: 'Reel',
            metadata: { thumbnailUrl: (reel as any).thumbnail } 
          }).catch(console.error);
          
          await notificationService.sendToUser(reel.ownerId.toString(), {
            title: 'New Comment',
            body: `${displayName} commented on your reel.`,
            data: { type: 'comment', targetId: reelId },
          });
        } catch (error) {
          console.error('Failed to send comment notification:', error);
        }
      }
    }

    activityService.logActivity({
      userId,
      actionType: 'comment_given',
      entityId: reelId,
      entityModel: 'Reel',
    }).catch(console.error);

    return toCommentDto(comment);
  }

  async listComments(
    reelId: string,
    query: CommentFeedQuery,
  ): Promise<{
    items: CommentDto[];
    nextCursor: string | null;
    hasNextPage: boolean;
    totalCount: number;
  }> {
    const cursor = query.cursor ? decodeEngagementCursor(query.cursor) : undefined;
    const [rows, totalCount] = await Promise.all([
      this.comments.listForTarget('reel', reelId, query.limit + 1, cursor),
      this.comments.countForTarget('reel', reelId),
    ]);
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toCommentDto),
      nextCursor:
        hasNextPage && last
          ? encodeEngagementCursor(last.createdAt, last._id)
          : null,
      hasNextPage,
      totalCount,
    };
  }

  async editComment(
    commentId: string,
    userId: string,
    input: EditCommentInput,
  ): Promise<CommentDto> {
    const updated = await this.comments.updateText(commentId, userId, input.text);

    if (!updated) {
      throw new NotFoundError('Comment was not found or you do not own it.', {
        code: 'COMMENT_NOT_FOUND',
      });
    }

    return toCommentDto(updated);
  }

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.comments.findById(commentId);

    if (!comment) {
      throw new NotFoundError('Comment was not found.', { code: 'COMMENT_NOT_FOUND' });
    }

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenError('Only the comment author can delete this comment.', {
        code: 'COMMENT_NOT_OWNED',
      });
    }

    await this.comments.softDelete(commentId, userId);

    if (!comment.parentCommentId) {
      await atomicCounterUpdate(comment.targetId.toString(), 'commentCount', -1);
    } else {
      await this.comments.incrementReplyCount(comment.parentCommentId, -1);
    }
  }
}

// ── DTO ──────────────────────────────────────────────────────────────────────

export interface CommentDto {
  id: string;
  text: string;
  authorId: string;
  authorName: string | null;
  authorAvatar: string | null;
  parentCommentId: string | null;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

function toCommentDto(doc: import('./comment/comment.model.js').CommentDocument): CommentDto {
  const author = doc.authorId as unknown as {
    _id?: Types.ObjectId;
    profile?: { displayName?: string; username?: string; photoUrl?: string };
  } | null;

  const authorId =
    author && typeof author === 'object' && '_id' in author
      ? (author._id?.toString() ?? doc.authorId.toString())
      : doc.authorId.toString();

  const profile = author && '_id' in author ? author.profile : undefined;

  return {
    id: doc._id.toString(),
    text: doc.status === 'active' ? doc.text : '[deleted]',
    authorId,
    authorName: profile?.displayName ?? profile?.username ?? null,
    authorAvatar: profile?.photoUrl ?? null,
    parentCommentId: doc.parentCommentId?.toString() ?? null,
    likeCount: doc.likeCount,
    replyCount: doc.replyCount,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const engagementService = new EngagementService();
