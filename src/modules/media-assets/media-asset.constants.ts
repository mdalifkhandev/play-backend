export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum MediaAssetPurpose {
  STORY = 'story',
  REEL = 'reel',
}

export enum MediaAssetUploadStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export enum MediaAssetAttachmentStatus {
  UNATTACHED = 'unattached',
  ATTACHED = 'attached',
}

export const STORY_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const STORY_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const REEL_IMAGE_MIME_TYPES = STORY_IMAGE_MIME_TYPES;
export const REEL_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

export const CLOUDINARY_FORMAT_MIME_TYPES = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
});
