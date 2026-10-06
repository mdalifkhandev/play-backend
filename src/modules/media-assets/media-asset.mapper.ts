import type { MediaAsset, MediaAssetDocument } from './media-asset.model.js';

type MediaAssetSource = MediaAsset | MediaAssetDocument;

export interface MediaAssetDto {
  id: string;
  provider: 'cloudinary';
  purpose: string;
  mediaType: string;
  mimeType: string;
  format: string | null;
  uploadStatus: string;
  attachmentStatus: string;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  durationMs: number | null;
  hasAudio: boolean | null;
  secureUrl: string | null;
  thumbnailUrl: string | null;
  verifiedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export function toMediaAssetDto(asset: MediaAssetSource): MediaAssetDto {
  const durationMs =
    asset.durationSeconds !== undefined
      ? Math.round(asset.durationSeconds * 1_000)
      : null;

  return {
    id: asset._id.toString(),
    provider: asset.provider,
    purpose: asset.purpose ?? 'story',
    mediaType: asset.mediaType,
    mimeType: asset.mimeType,
    format: asset.format ?? null,
    uploadStatus: asset.uploadStatus,
    attachmentStatus: asset.attachmentStatus,
    fileSizeBytes: asset.fileSizeBytes ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    durationSeconds: asset.durationSeconds ?? null,
    durationMs,
    hasAudio: asset.hasAudio ?? null,
    secureUrl: asset.secureUrl ?? null,
    thumbnailUrl: asset.thumbnailUrl ?? null,
    verifiedAt: asset.verifiedAt?.toISOString() ?? null,
    expiresAt: asset.expiresAt.toISOString(),
    createdAt: asset.createdAt.toISOString(),
  };
}
