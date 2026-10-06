import type { NextFunction, Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { engagementService } from './engagement.service.js';
import type {
  CommentFeedQuery,
  CreateCommentInput,
  EditCommentInput,
  SavedFeedQuery,
  ShareInput,
} from './engagement.validation.js';

export class EngagementController {
  // ── Like ──────────────────────────────────────────────────────────────────

  async likeReel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { reelId } = req.params as { reelId: string };
      const result = await engagementService.likeReel(userId, reelId);
      sendSuccess(res, 200, 'Reel liked.', result);
    } catch (error) {
      next(error);
    }
  }

  async unlikeReel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { reelId } = req.params as { reelId: string };
      const result = await engagementService.unlikeReel(userId, reelId);
      sendSuccess(res, 200, 'Reel unliked.', result);
    } catch (error) {
      next(error);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async saveReel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { reelId } = req.params as { reelId: string };
      const result = await engagementService.saveReel(userId, reelId);
      sendSuccess(res, 200, 'Reel saved.', result);
    } catch (error) {
      next(error);
    }
  }

  async unsaveReel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { reelId } = req.params as { reelId: string };
      const result = await engagementService.unsaveReel(userId, reelId);
      sendSuccess(res, 200, 'Reel unsaved.', result);
    } catch (error) {
      next(error);
    }
  }

  async listSaved(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await engagementService.listSaved(userId, req.query as unknown as SavedFeedQuery);
      sendSuccess(res, 200, 'Saved items fetched.', result);
    } catch (error) {
      next(error);
    }
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  async listSavedReels(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await engagementService.listSavedReels(
        userId,
        req.query as unknown as SavedFeedQuery,
      );
      sendSuccess(res, 200, 'Saved reels fetched.', result);
    } catch (error) {
      next(error);
    }
  }

  async listLikedReels(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await engagementService.listLikedReels(
        userId,
        req.query as unknown as SavedFeedQuery,
      );
      sendSuccess(res, 200, 'Liked reels fetched.', result);
    } catch (error) {
      next(error);
    }
  }

  async shareReel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { reelId } = req.params as { reelId: string };
      const result = await engagementService.shareReel(userId, reelId, req.body as ShareInput);
      sendSuccess(res, 200, 'Reel shared.', result);
    } catch (error) {
      next(error);
    }
  }

  // ── Comment ───────────────────────────────────────────────────────────────

  async createComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { reelId } = req.params as { reelId: string };
      const result = await engagementService.createComment(userId, reelId, req.body as CreateCommentInput);
      sendSuccess(res, 201, 'Comment posted.', result);
    } catch (error) {
      next(error);
    }
  }

  async listComments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reelId } = req.params as { reelId: string };
      const result = await engagementService.listComments(reelId, req.query as unknown as CommentFeedQuery);
      sendSuccess(res, 200, 'Comments fetched.', result);
    } catch (error) {
      next(error);
    }
  }

  async editComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params as { commentId: string };
      const result = await engagementService.editComment(commentId, userId, req.body as EditCommentInput);
      sendSuccess(res, 200, 'Comment updated.', result);
    } catch (error) {
      next(error);
    }
  }

  async deleteComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { commentId } = req.params as { commentId: string };
      await engagementService.deleteComment(commentId, userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}

export const engagementController = new EngagementController();
