import { Types } from 'mongoose';

import { ReelStatus } from './reel.constants.js';
import type { Reel } from './reel.model.js';

export interface PopulatedReelOwner {
  _id: Types.ObjectId;
  profile?: {
    displayName?: string;
    username?: string;
    photoUrl?: string;
  };
}

export type ReelWithOwner = Omit<Reel, 'ownerId'> & {
  ownerId: Types.ObjectId | PopulatedReelOwner;
};

export interface ReelStatusDto {
  id: string;
  status: string;
  progress: number;
  caption: string | null;
  visibility: string;
  forKids: boolean;
  media: {
    rawUrl: string | null;
    processedUrl: string | null;
    thumbnailUrl: string | null;
    durationMs: number | null;
    width: number | null;
    height: number | null;
  };
  edit: {
    originalVolume: number;
    musicVolume: number;
    filter: string;
    effect: string;
    music: {
      provider: 'jamendo';
      providerTrackId: string;
      title: string;
      artistName: string;
      albumName: string | null;
      coverImageUrl: string | null;
      trackDurationMs: number;
      licenseUrl: string | null;
      trimStartMs: number;
      trimEndMs: number;
      volume: number;
    } | null;
  };
  error: {
    code: string;
    message: string;
    canRetry: boolean;
  } | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface ReelFeedItemDto {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationMs: number;
  caption: string | null;
  user: {
    id: string;
    username: string | null;
    avatarUrl: string | null;
  };
  stats: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  viewerState: {
    isLiked: boolean;
    isSaved: boolean;
  } | null;
  createdAt: string;
  publishedAt: string;
}

export function toReelStatusDto(reel: Reel, viewerId?: string): ReelStatusDto {
  const isOwner = viewerId !== undefined && reel.ownerId.toString() === viewerId;
  const failed = reel.status === ReelStatus.FAILED;
  const canRetry =
    isOwner &&
    (reel.status === ReelStatus.FAILED ||
      reel.processing.queueSubmissionState === 'failed');

  return {
    id: reel._id.toString(),
    status: reel.status,
    progress: reel.progress,
    caption: reel.caption ?? null,
    visibility: reel.visibility,
    forKids: reel.forKids,
    media: {
      rawUrl: isOwner ? reel.rawMedia.secureUrl : null,
      processedUrl: reel.processedMedia?.secureUrl ?? null,
      thumbnailUrl: reel.thumbnail?.secureUrl ?? null,
      durationMs: reel.processedMedia?.durationMs ?? null,
      width: reel.processedMedia?.width ?? null,
      height: reel.processedMedia?.height ?? null,
    },
    edit: {
      originalVolume: reel.audioEdit.originalVolume,
      musicVolume: reel.audioEdit.musicVolume,
      filter: reel.videoEdit.filter,
      effect: reel.videoEdit.effect,
      music: reel.audioEdit.music
        ? {
            provider: 'jamendo',
            providerTrackId: reel.audioEdit.music.providerTrackId,
            title: reel.audioEdit.music.title,
            artistName: reel.audioEdit.music.artistName,
            albumName: reel.audioEdit.music.albumName ?? null,
            coverImageUrl: reel.audioEdit.music.coverImageUrl ?? null,
            trackDurationMs: reel.audioEdit.music.trackDurationMs,
            licenseUrl: reel.audioEdit.music.licenseUrl ?? null,
            trimStartMs: reel.audioEdit.music.trimStartMs,
            trimEndMs: reel.audioEdit.music.trimEndMs,
            volume: reel.audioEdit.music.volume,
          }
        : null,
    },
    error:
      failed && reel.processing.errorCode
        ? {
            code: reel.processing.errorCode,
            message: reel.processing.errorMessage ?? 'Processing failed.',
            canRetry,
          }
        : null,
    createdAt: reel.createdAt.toISOString(),
    publishedAt: reel.publishedAt?.toISOString() ?? null,
  };
}

export function toReelFeedItemDto(
  reel: ReelWithOwner,
  viewerState?: { isLiked: boolean; isSaved: boolean },
): ReelFeedItemDto {
  const owner = isPopulatedOwner(reel.ownerId) ? reel.ownerId : undefined;
  const ownerId = owner?._id.toString() ?? reel.ownerId.toString();
  const profile = owner?.profile;

  return {
    id: reel._id.toString(),
    videoUrl: reel.processedMedia!.secureUrl,
    thumbnailUrl: reel.thumbnail!.secureUrl,
    durationMs: reel.processedMedia!.durationMs,
    caption: reel.caption ?? null,
    user: {
      id: ownerId,
      username: profile?.username ?? null,
      avatarUrl: profile?.photoUrl ?? null,
    },
    stats: {
      likes: reel.likeCount,
      comments: reel.commentCount,
      shares: reel.shareCount,
      views: reel.viewCount,
    },
    viewerState: viewerState ?? null,
    createdAt: reel.createdAt.toISOString(),
    publishedAt: reel.publishedAt!.toISOString(),
  };
}

function isPopulatedOwner(
  value: Types.ObjectId | PopulatedReelOwner,
): value is PopulatedReelOwner {
  return !(value instanceof Types.ObjectId) && '_id' in value;
}
