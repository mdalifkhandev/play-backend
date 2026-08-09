import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import {
  ReelEffect,
  ReelFilter,
  ReelQueueSubmissionState,
  ReelStatus,
  ReelVisibility,
} from './reel.constants.js';

export interface ReelRawMediaSnapshot {
  mediaAssetId: Types.ObjectId;
  provider: 'cloudinary';
  publicId: string;
  version: number;
  secureUrl: string;
  width: number;
  height: number;
  durationMs: number;
  fileSizeBytes: number;
  mimeType: string;
  format?: string;
  hasAudio?: boolean;
}

export interface ReelProcessedMediaSnapshot {
  provider: 'cloudinary';
  publicId: string;
  version: number;
  secureUrl: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  durationMs: number;
  format: string;
}

export interface ReelThumbnailSnapshot {
  provider: 'cloudinary';
  publicId: string;
  version: number;
  secureUrl: string;
  width: number;
  height: number;
}

export interface ReelMusicSnapshot {
  provider: 'jamendo';
  providerTrackId: string;
  title: string;
  artistName: string;
  albumName?: string;
  coverImageUrl?: string;
  audioSourceUrl: string;
  trackDurationMs: number;
  licenseUrl?: string;
  downloadAllowed: boolean;
  trimStartMs: number;
  trimEndMs: number;
  volume: number;
  verifiedAt: Date;
}

export interface ReelAudioEdit {
  originalVolume: number;
  musicVolume: number;
  music?: ReelMusicSnapshot;
}

export interface ReelOverlayText {
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

export interface ReelLocationSnapshot {
  name?: string;
  latitude?: number;
  longitude?: number;
}

export interface ReelVideoEdit {
  trimStartMs: number;
  trimEndMs: number;
  filter: ReelFilter;
  effect: ReelEffect;
  exposure: number;
  contrast: number;
  overlayText?: ReelOverlayText;
}

export interface ReelProcessingState {
  jobId?: string;
  attempts: number;
  retryCount: number;
  queueSubmissionState: ReelQueueSubmissionState;
  cancelRequested: boolean;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  lastEnqueuedAt?: Date;
}

export interface Reel {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  status: ReelStatus;
  progress: number;
  caption?: string;
  hashtags?: string[];
  mentions?: Types.ObjectId[];
  location?: ReelLocationSnapshot;
  mediaType: 'video' | 'photo';
  visibility: ReelVisibility;
  forKids: boolean;
  rawMedia: ReelRawMediaSnapshot;
  processedMedia?: ReelProcessedMediaSnapshot;
  thumbnail?: ReelThumbnailSnapshot;
  audioEdit: ReelAudioEdit;
  videoEdit: ReelVideoEdit;
  processing: ReelProcessingState;
  idempotencyKey: string;
  requestHash: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  publishedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ReelDocument = HydratedDocument<Reel>;
export type CreateReelRecord = Omit<
  Reel,
  | '_id'
  | 'createdAt'
  | 'updatedAt'
  | 'viewCount'
  | 'likeCount'
  | 'commentCount'
  | 'shareCount'
  | 'processedMedia'
  | 'thumbnail'
  | 'publishedAt'
  | 'deletedAt'
>;

const rawMediaSchema = new Schema<ReelRawMediaSnapshot>(
  {
    mediaAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', required: true },
    provider: { type: String, enum: ['cloudinary'], required: true },
    publicId: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    secureUrl: { type: String, required: true, trim: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    durationMs: { type: Number, required: true, min: 1 },
    fileSizeBytes: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true, trim: true },
    format: { type: String, trim: true },
    hasAudio: { type: Boolean },
  },
  { _id: false },
);

const processedMediaSchema = new Schema<ReelProcessedMediaSnapshot>(
  {
    provider: { type: String, enum: ['cloudinary'], required: true },
    publicId: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    secureUrl: { type: String, required: true, trim: true },
    fileSizeBytes: { type: Number, required: true, min: 1 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    durationMs: { type: Number, required: true, min: 1 },
    format: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const thumbnailSchema = new Schema<ReelThumbnailSnapshot>(
  {
    provider: { type: String, enum: ['cloudinary'], required: true },
    publicId: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    secureUrl: { type: String, required: true, trim: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const musicSchema = new Schema<ReelMusicSnapshot>(
  {
    provider: { type: String, enum: ['jamendo'], required: true },
    providerTrackId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    artistName: { type: String, required: true, trim: true },
    albumName: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    audioSourceUrl: { type: String, required: true, trim: true, select: false },
    trackDurationMs: { type: Number, required: true, min: 1 },
    licenseUrl: { type: String, trim: true },
    downloadAllowed: { type: Boolean, required: true },
    trimStartMs: { type: Number, required: true, min: 0 },
    trimEndMs: { type: Number, required: true, min: 1 },
    volume: { type: Number, required: true, min: 0, max: 100 },
    verifiedAt: { type: Date, required: true },
  },
  { _id: false },
);

const audioEditSchema = new Schema<ReelAudioEdit>(
  {
    originalVolume: { type: Number, required: true, min: 0, max: 100 },
    musicVolume: { type: Number, required: true, min: 0, max: 100 },
    music: { type: musicSchema },
  },
  { _id: false },
);

const overlayTextSchema = new Schema<ReelOverlayText>(
  {
    text: { type: String, required: true, maxlength: 80 },
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    fontSize: { type: Number, required: true, min: 12, max: 96 },
  },
  { _id: false },
);

const videoEditSchema = new Schema<ReelVideoEdit>(
  {
    trimStartMs: { type: Number, required: true, min: 0 },
    trimEndMs: { type: Number, required: true, min: 1 },
    filter: { type: String, enum: Object.values(ReelFilter), required: true },
    effect: { type: String, enum: Object.values(ReelEffect), required: true },
    exposure: { type: Number, required: true, min: 0, max: 100 },
    contrast: { type: Number, required: true, min: 0, max: 100 },
    overlayText: { type: overlayTextSchema },
  },
  { _id: false },
);

const processingSchema = new Schema<ReelProcessingState>(
  {
    jobId: { type: String, trim: true },
    attempts: { type: Number, default: 0, min: 0, required: true },
    retryCount: { type: Number, default: 0, min: 0, required: true },
    queueSubmissionState: {
      type: String,
      enum: Object.values(ReelQueueSubmissionState),
      default: ReelQueueSubmissionState.PENDING,
      required: true,
    },
    cancelRequested: { type: Boolean, default: false, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    errorCode: { type: String, trim: true },
    errorMessage: { type: String, trim: true, maxlength: 300 },
    lastEnqueuedAt: { type: Date },
  },
  { _id: false },
);

const locationSchema = new Schema<ReelLocationSnapshot>(
  {
    name: { type: String, trim: true, maxlength: 100 },
    latitude: { type: Number },
    longitude: { type: Number },
  },
  { _id: false },
);

const reelSchema = new Schema<Reel>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(ReelStatus),
      default: ReelStatus.QUEUED,
      required: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100, required: true },
    caption: { type: String, trim: true, maxlength: 500 },
    hashtags: [{ type: String, trim: true, lowercase: true, index: true }],
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    location: { type: locationSchema },
    mediaType: { type: String, enum: ['video', 'photo'], default: 'video', required: true },
    visibility: {
      type: String,
      enum: Object.values(ReelVisibility),
      default: ReelVisibility.PUBLIC,
      required: true,
    },
    forKids: { type: Boolean, default: false, required: true },
    rawMedia: { type: rawMediaSchema, required: true },
    processedMedia: { type: processedMediaSchema },
    thumbnail: { type: thumbnailSchema },
    audioEdit: { type: audioEditSchema, required: true },
    videoEdit: { type: videoEditSchema, required: true },
    processing: { type: processingSchema, required: true },
    idempotencyKey: { type: String, required: true, trim: true, select: false },
    requestHash: { type: String, required: true, trim: true, select: false },
    viewCount: { type: Number, default: 0, min: 0, required: true },
    likeCount: { type: Number, default: 0, min: 0, required: true },
    commentCount: { type: Number, default: 0, min: 0, required: true },
    shareCount: { type: Number, default: 0, min: 0, required: true },
    publishedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

reelSchema.index(
  { ownerId: 1, idempotencyKey: 1 },
  { unique: true, name: 'uq_reels_owner_idempotency_key' },
);
reelSchema.index(
  { 'rawMedia.mediaAssetId': 1 },
  { unique: true, name: 'uq_reels_raw_media_asset_id' },
);
reelSchema.index({ status: 1, createdAt: -1 }, { name: 'ix_reels_status_created_at' });
reelSchema.index(
  { status: 1, visibility: 1, publishedAt: -1, _id: -1 },
  { name: 'ix_reels_feed' },
);
reelSchema.index(
  { hashtags: 1, status: 1, publishedAt: -1 },
  { name: 'ix_reels_hashtags_feed' },
);
reelSchema.index({ ownerId: 1, createdAt: -1 }, { name: 'ix_reels_owner_created_at' });
reelSchema.index(
  { 'processing.jobId': 1 },
  { sparse: true, name: 'ix_reels_processing_job_id' },
);
reelSchema.index(
  { status: 1, 'processing.queueSubmissionState': 1, createdAt: 1 },
  { name: 'ix_reels_queue_recovery' },
);
reelSchema.index(
  { deletedAt: 1, 'processing.cancelRequested': 1 },
  { sparse: true, name: 'ix_reels_deleted_cleanup' },
);

export const ReelModel: Model<Reel> =
  (mongoose.models.Reel as Model<Reel> | undefined) ?? model<Reel>('Reel', reelSchema);
