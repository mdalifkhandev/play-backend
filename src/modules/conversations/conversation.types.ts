import type { ConversationType } from './conversation.constants.js';

export interface CreateConversationDTO {
  targetUserId: string;
}

export interface SendMessageDTO {
  text?: string;
  mediaUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
}

export interface ConversationParticipantDTO {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isOnline?: boolean;
}

export interface LastMessageDTO {
  id?: string;
  text?: string;
  mediaUrl?: string;
  senderId: string;
  createdAt: string;
}

export interface ConversationResponseDTO {
  id: string;
  type: ConversationType;
  participant: ConversationParticipantDTO;
  lastMessage?: LastMessageDTO;
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface MessageResponseDTO {
  id: string;
  conversationId: string;
  sender: ConversationParticipantDTO;
  text?: string;
  mediaUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
  deliveredAt?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface RecommendedUserDTO {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  reason: string;
  isFollowing: boolean;
}
