import { Types } from 'mongoose';

import { ReelStatus } from './reel.constants.js';
import type { Reel } from './reel.model.js';

export interface PopulatedReelOwner {
  _id: Types.ObjectId;
  email?: string;
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
  hashtags: string[];
  mentions: string[];
  location: { name: string | null; latitude: number | null; longitude: number | null } | null;
  mediaType: 'video' | 'photo';
  visibility: string;
  kids: boolean;
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
  hashtags: string[];
  mentions: string[];
  location: { name: string | null; latitude: number | null; longitude: number | null } | null;
  mediaType: 'video' | 'photo';
  upload: {
    mediaAssetId: string;
    provider: 'cloudinary';
    publicId: string;
    version: number;
    secureUrl: string;
    width: number;
    height: number;
    durationMs: number;
    fileSizeBytes: number;
    mimeType: string;
    format: string | null;
    hasAudio: boolean | null;
  };
  edit: {
    filter: string;
    effect: string;
    overlayText: {
      text: string;
      x: number;
      y: number;
      fontSize: number;
    } | null;
  };
  kids: boolean;
  forKids: boolean;
  user: {
    id: string;
    email: string | null;
    username: string | null;
    displayName: string | null;
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
    hashtags: reel.hashtags ?? [],
    mentions: (reel.mentions ?? []).map((m) => m.toString()),
    location: reel.location
      ? {
          name: reel.location.name ?? null,
          latitude: reel.location.latitude ?? null,
          longitude: reel.location.longitude ?? null,
        }
      : null,
    mediaType: reel.mediaType ?? 'video',
    visibility: reel.visibility,
    kids: reel.forKids,
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

  const videoUrl = reel.processedMedia?.secureUrl || reel.rawMedia?.secureUrl || '';
  const thumbnailUrl = reel.thumbnail?.secureUrl || reel.rawMedia?.secureUrl || '';
  const durationMs = reel.processedMedia?.durationMs || reel.rawMedia?.durationMs || 5000;

  return {
    id: reel._id.toString(),
    videoUrl,
    thumbnailUrl,
    durationMs,
    caption: reel.caption ?? null,
    hashtags: reel.hashtags ?? [],
    mentions: (reel.mentions ?? []).map((m) => m.toString()),
    location: reel.location
      ? {
          name: reel.location.name ?? null,
          latitude: reel.location.latitude ?? null,
          longitude: reel.location.longitude ?? null,
        }
      : null,
    mediaType: reel.mediaType ?? 'video',
    upload: {
      mediaAssetId: reel.rawMedia.mediaAssetId.toString(),
      provider: reel.rawMedia.provider,
      publicId: reel.rawMedia.publicId,
      version: reel.rawMedia.version,
      secureUrl: reel.rawMedia.secureUrl,
      width: reel.rawMedia.width,
      height: reel.rawMedia.height,
      durationMs: reel.rawMedia.durationMs,
      fileSizeBytes: reel.rawMedia.fileSizeBytes,
      mimeType: reel.rawMedia.mimeType,
      format: reel.rawMedia.format ?? null,
      hasAudio: reel.rawMedia.hasAudio ?? null,
    },
    edit: {
      filter: reel.videoEdit.filter,
      effect: reel.videoEdit.effect,
      overlayText: reel.videoEdit.overlayText
        ? {
            text: reel.videoEdit.overlayText.text,
            x: reel.videoEdit.overlayText.x,
            y: reel.videoEdit.overlayText.y,
            fontSize: reel.videoEdit.overlayText.fontSize,
          }
        : null,
    },
    kids: reel.forKids ?? false,
    forKids: reel.forKids ?? false,
    user: {
      id: ownerId,
      email: owner?.email ?? null,
      username: profile?.username ?? owner?.email?.split('@')[0] ?? null,
      displayName: profile?.displayName ?? profile?.username ?? owner?.email?.split('@')[0] ?? null,
      avatarUrl: profile?.photoUrl ?? null,
    },
    stats: {
      likes: reel.likeCount || 0,
      comments: reel.commentCount || 0,
      shares: reel.shareCount || 0,
      views: reel.viewCount || 0,
    },
    viewerState: viewerState ?? null,
    createdAt: reel.createdAt ? reel.createdAt.toISOString() : new Date().toISOString(),
    publishedAt: (reel.publishedAt ?? reel.createdAt ?? new Date()).toISOString(),
  };
}

function isPopulatedOwner(
  value: Types.ObjectId | PopulatedReelOwner,
): value is PopulatedReelOwner {
  return !(value instanceof Types.ObjectId) && '_id' in value;
}
