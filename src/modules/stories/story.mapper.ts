import { Types } from 'mongoose';

import type { Story } from './story.model.js';

export interface PopulatedStoryOwner {
  _id: Types.ObjectId;
  profile?: {
    displayName?: string;
    username?: string;
    photoUrl?: string;
  };
}

export type StoryWithOwner = Omit<Story, 'ownerId'> & {
  ownerId: Types.ObjectId | PopulatedStoryOwner;
};

export interface StoryDto {
  id: string;
  owner: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  media: {
    mediaAssetId: string;
    type: string;
    url: string;
    thumbnailUrl: string;
    mimeType: string;
    width: number;
    height: number;
    fileSizeBytes: number;
    originalDurationSeconds: number | null;
  };
  imageSettings: { displayDurationSeconds: number } | null;
  videoEditing: {
    trimStartSeconds: number;
    trimEndSeconds: number;
    originalAudioEnabled: boolean;
    originalAudioVolume: number;
  } | null;
  music: {
    provider: 'jamendo';
    providerTrackId: string;
    title: string;
    artistName: string;
    albumName: string | null;
    coverImageUrl: string | null;
    audioPreviewUrl: string;
    trackDurationSeconds: number;
    shareUrl: string | null;
    licenseUrl: string | null;
    downloadAllowed: boolean;
    startTimeSeconds: number;
    clipDurationSeconds: number;
    volume: number;
    verifiedAt: string;
  } | null;
  caption: string | null;
  visibility: string;
  playbackDurationSeconds: number;
  viewCount: number;
  publishedAt: string;
  expiresAt: string;
}

export function toStoryDto(story: StoryWithOwner): StoryDto {
  const owner = isPopulatedOwner(story.ownerId) ? story.ownerId : undefined;
  const ownerId = owner?._id.toString() ?? story.ownerId.toString();
  const profile = owner?.profile;

  return {
    id: story._id.toString(),
    owner: {
      id: ownerId,
      name: profile?.displayName ?? profile?.username ?? 'User',
      avatarUrl: profile?.photoUrl ?? null,
    },
    media: {
      mediaAssetId: story.media.mediaAssetId.toString(),
      type: story.media.mediaType,
      url: story.media.secureUrl,
      thumbnailUrl: story.media.thumbnailUrl,
      mimeType: story.media.mimeType,
      width: story.media.width,
      height: story.media.height,
      fileSizeBytes: story.media.fileSizeBytes,
      originalDurationSeconds: story.media.originalDurationSeconds ?? null,
    },
    imageSettings: story.imageSettings
      ? { displayDurationSeconds: story.imageSettings.displayDurationSeconds }
      : null,
    videoEditing: story.videoEditing
      ? {
          trimStartSeconds: story.videoEditing.trimStartSeconds,
          trimEndSeconds: story.videoEditing.trimEndSeconds,
          originalAudioEnabled: story.videoEditing.originalAudioEnabled,
          originalAudioVolume: story.videoEditing.originalAudioVolume,
        }
      : null,
    music: story.music
      ? {
          provider: story.music.provider,
          providerTrackId: story.music.providerTrackId,
          title: story.music.title,
          artistName: story.music.artistName,
          albumName: story.music.albumName ?? null,
          coverImageUrl: story.music.coverImageUrl ?? null,
          audioPreviewUrl: story.music.audioPreviewUrl,
          trackDurationSeconds: story.music.trackDurationSeconds,
          shareUrl: story.music.shareUrl ?? null,
          licenseUrl: story.music.licenseUrl ?? null,
          downloadAllowed: story.music.downloadAllowed,
          startTimeSeconds: story.music.startTimeSeconds,
          clipDurationSeconds: story.music.clipDurationSeconds,
          volume: story.music.volume,
          verifiedAt: story.music.verifiedAt.toISOString(),
        }
      : null,
    caption: story.caption ?? null,
    visibility: story.visibility,
    playbackDurationSeconds: story.playbackDurationSeconds,
    viewCount: story.viewCount,
    publishedAt: story.publishedAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
  };
}

function isPopulatedOwner(
  value: Types.ObjectId | PopulatedStoryOwner,
): value is PopulatedStoryOwner {
  return !(value instanceof Types.ObjectId) && '_id' in value;
}
