import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { conversationService, ConversationService } from './conversation.service.js';

export class ConversationController {
  constructor(private readonly service: ConversationService = conversationService) {}

  getInbox = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const result = await this.service.getInbox(userId, req.query as any);
    sendSuccess(res, 200, 'Inbox retrieved successfully.', result);
  };

  createOrGetConversation = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { targetUserId } = req.body;
    const conversation = await this.service.getOrCreateConversation(userId, targetUserId);
    sendSuccess(res, 200, 'Conversation initialized.', conversation);
  };

  sendMessage = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const message = await this.service.sendMessage(id as string, userId, req.body);
    sendSuccess(res, 201, 'Message sent successfully.', message);
  };

  getMessages = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const result = await this.service.getMessages(id as string, userId, req.query as any);
    sendSuccess(res, 200, 'Messages retrieved successfully.', result);
  };

  deleteConversation = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params;
    await this.service.deleteConversation(id as string, userId);
    sendSuccess(res, 200, 'Conversation deleted.', { deleted: true });
  };

  blockUser = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { targetUserId } = req.params;
    const result = await this.service.blockUser(userId, targetUserId as string);
    sendSuccess(res, 200, 'User blocked.', result);
  };

  unblockUser = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { targetUserId } = req.params;
    const result = await this.service.unblockUser(userId, targetUserId as string);
    sendSuccess(res, 200, 'User unblocked.', result);
  };

  getRecommendedUsers = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const recommendations = await this.service.getRecommendedUsers(userId);
    sendSuccess(res, 200, 'Recommended users retrieved.', recommendations);
  };
}

export const conversationController = new ConversationController();
