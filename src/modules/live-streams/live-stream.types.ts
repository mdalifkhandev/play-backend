import type { LiveStreamFeedTab, LiveStreamRole, LiveStreamStatus } from './live-stream.constants.js';

export interface CreateLiveStreamDTO {
  title: string;
  description?: string;
  coverImage?: string;
  category?: string;
  scheduledFor?: Date;
}

export interface LiveStreamFeedQueryDTO {
  tab?: LiveStreamFeedTab;
  category?: string;
  page?: number;
  limit?: number;
}

export interface StreamTokenResponseDTO {
  appId: string;
  token: string;
  channelName: string;
  uid: number;
  role: LiveStreamRole;
  expiresInSeconds: number;
}

export interface LiveStreamHostResponseDTO {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

export interface LiveStreamResponseDTO {
  id: string;
  host: LiveStreamHostResponseDTO;
  title: string;
  description?: string;
  coverImage?: string;
  status: LiveStreamStatus;
  channelName: string;
  viewerCount: number;
  peakViewerCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  giftsCount: number;
  category?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface LiveStreamCommentResponseDTO {
  id: string;
  streamId: string;
  user: LiveStreamHostResponseDTO;
  text: string;
  createdAt: string;
}
