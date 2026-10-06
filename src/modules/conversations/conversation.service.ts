import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.config.js';
import { logger } from '../../infrastructure/logger/logger.js';
import {
  enqueueBestEffort,
  enqueueSendUserPushJob,
} from '../../infrastructure/queue/background.queue.js';
import { cloudinaryStorage } from '../../infrastructure/storage/index.js';
import { notificationService } from '../notifications/notification.service.js';
import { ConversationRepository, conversationRepository } from './conversation.repository.js';
import type {
  ConversationResponseDTO,
  MessageResponseDTO,
  RecommendedUserDTO,
  SendMessageDTO,
  BlockStatusDTO,
} from './conversation.types.js';
import type { IConversation } from './conversation.model.js';
import type { IMessage } from './message.model.js';
import { UserModel } from '../users/user.model.js';

export class ConversationService {
  constructor(private readonly repository: ConversationRepository = conversationRepository) {}

  async getInbox(
    userId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<{
    items: ConversationResponseDTO[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const { items, total } = await this.repository.getUserInbox(userId, page, limit);

    return {
      items: items.map((c) => this.mapToConversationResponse(c, userId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getOrCreateConversation(
    userId: string,
    targetUserId: string,
  ): Promise<ConversationResponseDTO> {
    if (userId === targetUserId) {
      throw new AppError('Cannot start a conversation with yourself.', 400, {
        code: 'INVALID_PARTICIPANT',
      });
    }

    const isBlocked = await this.repository.isBlocked(targetUserId, userId);
    if (isBlocked) {
      throw new AppError('Cannot contact this user.', 403, { code: 'USER_BLOCKED' });
    }

    const conversation = await this.repository.findOrCreateDirectConversation(userId, targetUserId);
    return this.mapToConversationResponse(conversation, userId);
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDTO,
  ): Promise<MessageResponseDTO> {
    if (!dto.text && !dto.mediaUrl) {
      throw new AppError('Message text or media is required.', 400, {
        code: 'EMPTY_MESSAGE',
      });
    }

    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found.', 404, { code: 'CONVERSATION_NOT_FOUND' });
    }

    const isParticipant = conversation.participants.some(
      (p: any) => (p._id?.toString() || p.toString()) === senderId,
    );
    if (!isParticipant) {
      throw new AppError('You are not a participant in this conversation.', 403, {
        code: 'FORBIDDEN',
      });
    }

    const recipientId = this.getParticipantIds(conversation).find((id) => id !== senderId);
    if (recipientId) {
      const isBlocked =
        (await this.repository.isBlocked(senderId, recipientId)) ||
        (await this.repository.isBlocked(recipientId, senderId));
      if (isBlocked) {
        throw new AppError('Cannot send a message to this user.', 403, {
          code: 'USER_BLOCKED',
        });
      }
    }

    const message = await this.repository.addMessage(
      conversationId,
      senderId,
      dto.text,
      dto.mediaUrl,
      dto.attachmentType,
    );
    const mappedMessage = this.mapToMessageResponse(message);

    if (recipientId) {
      void this.sendMessageNotification(recipientId, mappedMessage);
    }

    return mappedMessage;
  }

  async uploadAttachment(
    userId: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalName: string;
      size: number;
    },
  ): Promise<{
    url: string;
    attachmentType: 'image' | 'video' | 'audio' | 'file';
    mimeType: string;
    fileName: string;
    size: number;
  }> {
    const attachmentType = getAttachmentType(file.mimetype);
    const resourceType =
      attachmentType === 'image' ? 'image' : attachmentType === 'file' ? 'raw' : 'video';

    const uploaded = await cloudinaryStorage.uploadBuffer(file.buffer, {
      folder: `jesusname7/chat/${userId}`,
      resourceType,
      tags: ['chat_attachment'],
    });

    return {
      url: uploaded.secureUrl,
      attachmentType,
      mimeType: file.mimetype,
      fileName: file.originalName,
      size: file.size,
    };
  }

  prepareAttachmentUpload(
    userId: string,
    input: {
      fileName: string;
      mimeType: string;
      attachmentType: 'image' | 'video' | 'audio' | 'file';
    },
  ): {
    uploadUrl: string;
    apiKey: string;
    timestamp: number;
    signature: string;
    publicId: string;
    resourceType: 'image' | 'video' | 'raw';
    attachmentType: 'image' | 'video' | 'audio' | 'file';
  } {
    const attachmentType = input.attachmentType || getAttachmentType(input.mimeType);
    const resourceType =
      attachmentType === 'image' ? 'image' : attachmentType === 'file' ? 'raw' : 'video';
    const publicId = `${env.CLOUDINARY_UPLOAD_FOLDER}/chat/${userId}/${randomUUID()}`;
    const signedUpload = cloudinaryStorage.createSignedUpload(publicId, resourceType);

    return {
      uploadUrl: signedUpload.uploadUrl,
      apiKey: signedUpload.apiKey,
      timestamp: signedUpload.timestamp,
      signature: signedUpload.signature,
      publicId: signedUpload.publicId,
      resourceType,
      attachmentType,
    };
  }

  async joinConversation(
    conversationId: string,
    userId: string,
  ): Promise<{ participantIds: string[]; messageIds: string[]; deliveredAt: string }> {
    const conversation = await this.requireParticipant(conversationId, userId);
    const delivery = await this.repository.markAsDelivered(conversationId, userId);

    return {
      participantIds: this.getParticipantIds(conversation),
      messageIds: delivery.messageIds,
      deliveredAt: delivery.deliveredAt.toISOString(),
    };
  }

  async markConversationRead(
    conversationId: string,
    userId: string,
  ): Promise<{ participantIds: string[]; messageIds: string[]; readAt: string }> {
    const conversation = await this.requireParticipant(conversationId, userId);
    const receipt = await this.repository.markAsRead(conversationId, userId);

    return {
      participantIds: this.getParticipantIds(conversation),
      messageIds: receipt.messageIds,
      readAt: receipt.readAt.toISOString(),
    };
  }

  async getMessages(
    conversationId: string,
    userId: string,
    query: { page?: number; limit?: number },
  ): Promise<{
    items: MessageResponseDTO[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 30));

    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found.', 404, { code: 'CONVERSATION_NOT_FOUND' });
    }

    const isParticipant = conversation.participants.some(
      (p: any) => (p._id?.toString() || p.toString()) === userId,
    );
    if (!isParticipant) {
      throw new AppError('You are not a participant in this conversation.', 403, {
        code: 'FORBIDDEN',
      });
    }

    // Auto-mark as read is disabled here so that the client's explicit socketMarkRead can trigger the read_receipt event.

    const { messages, total } = await this.repository.getMessages(conversationId, page, limit);

    return {
      items: messages.map((m) => this.mapToMessageResponse(m)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found.', 404, { code: 'CONVERSATION_NOT_FOUND' });
    }

    await this.repository.softDeleteConversation(conversationId, userId);
  }

  async blockUser(userId: string, targetUserId: string): Promise<{ blocked: boolean }> {
    if (userId === targetUserId) {
      throw new AppError('Cannot block yourself.', 400, { code: 'INVALID_USER' });
    }
    await this.repository.blockUser(userId, targetUserId);
    return { blocked: true };
  }

  async unblockUser(userId: string, targetUserId: string): Promise<{ blocked: boolean }> {
    await this.repository.unblockUser(userId, targetUserId);
    return { blocked: false };
  }

  async getBlockStatus(userId: string, targetUserId: string): Promise<BlockStatusDTO> {
    if (userId === targetUserId) {
      return { blockedByMe: false, blockedMe: false, canUnblock: false };
    }

    const [blockedByMe, blockedMe] = await Promise.all([
      this.repository.isBlocked(userId, targetUserId),
      this.repository.isBlocked(targetUserId, userId),
    ]);

    return {
      blockedByMe,
      blockedMe,
      canUnblock: blockedByMe,
    };
  }

  async getRecommendedUsers(userId: string): Promise<RecommendedUserDTO[]> {
    // Fetches suggested users for "People you may know" section
    const users = await UserModel.find({ _id: { $ne: userId } })
      .limit(10)
      .exec();

    return users.map((u) => ({
      id: u._id.toString(),
      username: u.profile.username || 'user',
      displayName: u.profile.displayName || u.profile.username || 'User',
      ...(u.profile.photoUrl ? { avatarUrl: u.profile.photoUrl } : {}),
      reason: 'People you may know',
      isFollowing: false,
    }));
  }

  async searchUsers(
    userId: string,
    query: { q: string; limit?: number },
  ): Promise<RecommendedUserDTO[]> {
    const search = query.q.trim();
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const escapedSearch = escapeRegExp(search);
    const searchRegex = new RegExp(escapedSearch, 'i');

    const users = await UserModel.find({
      _id: { $ne: userId },
      status: 'active',
      $or: [
        { email: searchRegex },
        { 'profile.username': searchRegex },
        { 'profile.displayName': searchRegex },
      ],
    } as any)
      .limit(limit)
      .exec();

    return users.map((u) => ({
      id: u._id.toString(),
      username: u.profile.username || 'user',
      displayName: u.profile.displayName || u.profile.username || u.email,
      ...(u.profile.photoUrl ? { avatarUrl: u.profile.photoUrl } : {}),
      reason: u.profile.username ? `@${u.profile.username}` : u.email,
      isFollowing: false,
    }));
  }

  private mapToConversationResponse(
    conv: IConversation,
    currentUserId: string,
  ): ConversationResponseDTO {
    const partnerDoc = conv.participants.find(
      (p: any) => (p._id?.toString() || p.toString()) !== currentUserId,
    ) as any;

    const unreadMap = conv.unreadCount || new Map();
    const unreadCount = unreadMap.get?.(currentUserId) || (unreadMap as any)[currentUserId] || 0;

    const participant = {
      id: partnerDoc?._id?.toString() || partnerDoc?.toString() || '',
      username: partnerDoc?.username || partnerDoc?.profile?.username || 'user',
      displayName:
        partnerDoc?.displayName ||
        partnerDoc?.profile?.displayName ||
        partnerDoc?.profile?.username ||
        partnerDoc?.username ||
        'User',
      avatarUrl: partnerDoc?.avatarUrl || partnerDoc?.photoUrl || partnerDoc?.profile?.photoUrl,
      isOnline: partnerDoc?.isOnline ?? false,
    };

    const response: ConversationResponseDTO = {
      id: conv._id.toString(),
      type: conv.type,
      participant,
      unreadCount: Math.max(0, unreadCount),
      updatedAt: conv.updatedAt.toISOString(),
      createdAt: conv.createdAt.toISOString(),
    };

    if (conv.lastMessage) {
      response.lastMessage = {
        ...(conv.lastMessage.messageId ? { id: conv.lastMessage.messageId.toString() } : {}),
        ...(conv.lastMessage.text ? { text: conv.lastMessage.text } : {}),
        ...(conv.lastMessage.mediaUrl ? { mediaUrl: conv.lastMessage.mediaUrl } : {}),
        ...(conv.lastMessage.attachmentType ? { attachmentType: conv.lastMessage.attachmentType } : {}),
        senderId: conv.lastMessage.senderId.toString(),
        createdAt: conv.lastMessage.createdAt.toISOString(),
      };
    }

    return response;
  }

  private mapToMessageResponse(message: IMessage): MessageResponseDTO {
    const senderDoc = message.senderId as any;

    const sender = {
      id: senderDoc?._id?.toString() || senderDoc?.toString() || '',
      username: senderDoc?.username || senderDoc?.profile?.username || 'user',
      displayName:
        senderDoc?.displayName ||
        senderDoc?.profile?.displayName ||
        senderDoc?.profile?.username ||
        senderDoc?.username ||
        'User',
      avatarUrl: senderDoc?.avatarUrl || senderDoc?.photoUrl || senderDoc?.profile?.photoUrl,
      isOnline: senderDoc?.isOnline ?? false,
    };

    const response: MessageResponseDTO = {
      id: message._id.toString(),
      conversationId: message.conversationId.toString(),
      sender,
      isRead: message.isRead,
      createdAt: message.createdAt.toISOString(),
    };

    if (message.text) response.text = message.text;
    if (message.mediaUrl) response.mediaUrl = message.mediaUrl;
    if (message.attachmentType) response.attachmentType = message.attachmentType;
    if (message.deliveredAt) response.deliveredAt = message.deliveredAt.toISOString();
    if (message.readAt) response.readAt = message.readAt.toISOString();

    return response;
  }

  private async requireParticipant(
    conversationId: string,
    userId: string,
  ): Promise<IConversation> {
    const conversation = await this.repository.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found.', 404, { code: 'CONVERSATION_NOT_FOUND' });
    }

    if (!this.getParticipantIds(conversation).includes(userId)) {
      throw new AppError('You are not a participant in this conversation.', 403, {
        code: 'FORBIDDEN',
      });
    }

    return conversation;
  }

  private getParticipantIds(conversation: IConversation): string[] {
    return conversation.participants.map((participant: any) =>
      (participant._id?.toString() || participant.toString()),
    );
  }

  private async sendMessageNotification(
    recipientId: string,
    message: MessageResponseDTO,
  ): Promise<void> {
    const senderName = message.sender.displayName || message.sender.username || 'New message';
    const body = message.text?.trim() || (message.mediaUrl ? 'Sent a media message' : 'Sent a message');

    try {
      await notificationService.createNotification({
        userId: new Types.ObjectId(recipientId),
        actorId: new Types.ObjectId(message.sender.id),
        type: 'chat_message',
        title: senderName,
        body,
        relatedEntityId: new Types.ObjectId(message.conversationId),
      });

      logger.info(
        {
          recipientId,
          conversationId: message.conversationId,
          messageId: message.id,
        },
        'Chat notification stored',
      );
    } catch (error) {
      logger.warn(
        {
          err: error,
          recipientId,
          conversationId: message.conversationId,
          messageId: message.id,
        },
        'Chat notification store skipped',
      );
    }

    await enqueueBestEffort(
      enqueueSendUserPushJob(recipientId, {
        title: senderName,
        body,
        data: {
          type: 'chat_message',
          conversationId: message.conversationId,
          messageId: message.id,
          senderId: message.sender.id,
        },
      }),
      {
        recipientId,
        conversationId: message.conversationId,
        messageId: message.id,
        job: 'chat-push',
      },
    );
  }
}

export const conversationService = new ConversationService();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAttachmentType(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}
