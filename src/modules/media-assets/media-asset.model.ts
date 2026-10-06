import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  MediaAssetAttachmentStatus,
  MediaAssetPurpose,
  MediaAssetUploadStatus,
  MediaType,
} from './media-asset.constants.js';

export interface MediaAsset {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  provider: 'cloudinary';
  providerAssetId?: string;
  publicId: string;
  version?: number;
  resourceType: MediaType;
  deliveryType: 'upload';
  secureUrl?: string;
  thumbnailUrl?: string;
  mediaType: MediaType;
  purpose: MediaAssetPurpose;
  mimeType: string;
  format?: string;
  declaredFileSizeBytes: number;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasAudio?: boolean;
  originalFileName?: string;
  uploadStatus: MediaAssetUploadStatus;
  attachmentStatus: MediaAssetAttachmentStatus;
  uploadSignatureId: string;
  expiresAt: Date;
  verifiedAt?: Date;
  cleanupEligibleAt?: Date;
  attachedStoryId?: Types.ObjectId;
  attachedReelId?: Types.ObjectId;
  cleanupAttemptCount: number;
  lastCleanupAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type MediaAssetDocument = HydratedDocument<MediaAsset>;

const mediaAssetSchema = new Schema<MediaAsset>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['cloudinary'], default: 'cloudinary', required: true },
    providerAssetId: { type: String, trim: true },
    publicId: { type: String, required: true, trim: true },
    version: { type: Number, min: 1 },
    resourceType: { type: String, enum: Object.values(MediaType), required: true },
    deliveryType: { type: String, enum: ['upload'], default: 'upload', required: true },
    secureUrl: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },
    mediaType: { type: String, enum: Object.values(MediaType), required: true },
    purpose: {
      type: String,
      enum: Object.values(MediaAssetPurpose),
      default: MediaAssetPurpose.STORY,
      required: true,
    },
    mimeType: { type: String, required: true, trim: true, lowercase: true },
    format: { type: String, trim: true, lowercase: true },
    declaredFileSizeBytes: { type: Number, required: true, min: 1 },
    fileSizeBytes: { type: Number, min: 1 },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
    durationSeconds: { type: Number, min: 0 },
    hasAudio: { type: Boolean },
    originalFileName: { type: String, trim: true, maxlength: 255 },
    uploadStatus: {
      type: String,
      enum: Object.values(MediaAssetUploadStatus),
      default: MediaAssetUploadStatus.PENDING,
      required: true,
    },
    attachmentStatus: {
      type: String,
      enum: Object.values(MediaAssetAttachmentStatus),
      default: MediaAssetAttachmentStatus.UNATTACHED,
      required: true,
    },
    uploadSignatureId: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date },
    cleanupEligibleAt: { type: Date },
    attachedStoryId: { type: Schema.Types.ObjectId, ref: 'Story' },
    attachedReelId: { type: Schema.Types.ObjectId, ref: 'Reel' },
    cleanupAttemptCount: { type: Number, default: 0, min: 0, required: true },
    lastCleanupAttemptAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

mediaAssetSchema.index({ publicId: 1 }, { unique: true, name: 'uq_media_assets_public_id' });
mediaAssetSchema.index(
  { uploadSignatureId: 1 },
  { unique: true, name: 'uq_media_assets_upload_signature_id' },
);
mediaAssetSchema.index(
  { ownerId: 1, createdAt: -1 },
  { name: 'ix_media_assets_owner_created_at' },
);
mediaAssetSchema.index(
  { uploadStatus: 1, expiresAt: 1 },
  { name: 'ix_media_assets_upload_status_expires_at' },
);
mediaAssetSchema.index(
  { ownerId: 1, attachmentStatus: 1 },
  { name: 'ix_media_assets_owner_attachment_status' },
);
mediaAssetSchema.index(
  { attachedStoryId: 1 },
  { unique: true, sparse: true, name: 'uq_media_assets_attached_story_id' },
);
mediaAssetSchema.index(
  { attachedReelId: 1 },
  { unique: true, sparse: true, name: 'uq_media_assets_attached_reel_id' },
);
mediaAssetSchema.index(
  { attachmentStatus: 1, cleanupEligibleAt: 1 },
  { name: 'ix_media_assets_cleanup_candidates' },
);
mediaAssetSchema.index(
  { purpose: 1, uploadStatus: 1, expiresAt: 1 },
  { name: 'ix_media_assets_purpose_upload_expires' },
);

export const MediaAssetModel: Model<MediaAsset> =
  (mongoose.models.MediaAsset as Model<MediaAsset> | undefined) ??
  model<MediaAsset>('MediaAsset', mediaAssetSchema);
