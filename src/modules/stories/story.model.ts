import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { MediaType } from '../media-assets/media-asset.constants.js';
import {
  StoryProcessingStatus,
  StoryStatus,
  StoryVisibility,
} from './story.constants.js';

export interface StoryMediaSnapshot {
  mediaAssetId: Types.ObjectId;
  provider: 'cloudinary';
  publicId: string;
  version: number;
  resourceType: MediaType;
  mediaType: MediaType;
  secureUrl: string;
  thumbnailUrl: string;
  mimeType: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  originalDurationSeconds?: number;
}

export interface StoryImageSettings {
  displayDurationSeconds: number;
}

export interface StoryVideoEditing {
  trimStartSeconds: number;
  trimEndSeconds: number;
  originalAudioEnabled: boolean;
  originalAudioVolume: number;
}

export interface StoryMusicSnapshot {
  provider: 'jamendo';
  providerTrackId: string;
  title: string;
  artistName: string;
  albumName?: string;
  coverImageUrl?: string;
  audioPreviewUrl: string;
  trackDurationSeconds: number;
  shareUrl?: string;
  licenseUrl?: string;
  downloadAllowed: boolean;
  startTimeSeconds: number;
  clipDurationSeconds: number;
  volume: number;
  verifiedAt: Date;
}

export interface Story {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  media: StoryMediaSnapshot;
  imageSettings?: StoryImageSettings;
  videoEditing?: StoryVideoEditing;
  music?: StoryMusicSnapshot;
  caption?: string;
  visibility: StoryVisibility;
  status: StoryStatus;
  processingStatus: StoryProcessingStatus;
  playbackDurationSeconds: number;
  viewCount: number;
  idempotencyKey: string;
  requestHash: string;
  publishedAt: Date;
  expiresAt: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type StoryDocument = HydratedDocument<Story>;
export type CreateStoryRecord = Omit<Story, '_id' | 'createdAt' | 'updatedAt' | 'viewCount'>;

const storyMediaSchema = new Schema<StoryMediaSnapshot>(
  {
    mediaAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', required: true },
    provider: { type: String, enum: ['cloudinary'], required: true },
    publicId: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    resourceType: { type: String, enum: Object.values(MediaType), required: true },
    mediaType: { type: String, enum: Object.values(MediaType), required: true },
    secureUrl: { type: String, required: true, trim: true },
    thumbnailUrl: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    fileSizeBytes: { type: Number, required: true, min: 1 },
    originalDurationSeconds: { type: Number, min: 0 },
  },
  { _id: false },
);

const imageSettingsSchema = new Schema<StoryImageSettings>(
  { displayDurationSeconds: { type: Number, required: true, min: 0 } },
  { _id: false },
);

const videoEditingSchema = new Schema<StoryVideoEditing>(
  {
    trimStartSeconds: { type: Number, required: true, min: 0 },
    trimEndSeconds: { type: Number, required: true, min: 0 },
    originalAudioEnabled: { type: Boolean, required: true },
    originalAudioVolume: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const musicSchema = new Schema<StoryMusicSnapshot>(
  {
    provider: { type: String, enum: ['jamendo'], required: true },
    providerTrackId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    artistName: { type: String, required: true, trim: true },
    albumName: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    audioPreviewUrl: { type: String, required: true, trim: true },
    trackDurationSeconds: { type: Number, required: true, min: 0 },
    shareUrl: { type: String, trim: true },
    licenseUrl: { type: String, trim: true },
    downloadAllowed: { type: Boolean, required: true },
    startTimeSeconds: { type: Number, required: true, min: 0 },
    clipDurationSeconds: { type: Number, required: true, min: 0 },
    volume: { type: Number, required: true, min: 0, max: 1 },
    verifiedAt: { type: Date, required: true },
  },
  { _id: false },
);

const storySchema = new Schema<Story>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    media: { type: storyMediaSchema, required: true },
    imageSettings: { type: imageSettingsSchema },
    videoEditing: { type: videoEditingSchema },
    music: { type: musicSchema },
    caption: { type: String, trim: true, maxlength: 500 },
    visibility: {
      type: String,
      enum: Object.values(StoryVisibility),
      default: StoryVisibility.PUBLIC,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(StoryStatus),
      default: StoryStatus.ACTIVE,
      required: true,
    },
    processingStatus: {
      type: String,
      enum: Object.values(StoryProcessingStatus),
      default: StoryProcessingStatus.NOT_REQUIRED,
      required: true,
    },
    playbackDurationSeconds: { type: Number, required: true, min: 0 },
    viewCount: { type: Number, default: 0, min: 0, required: true },
    idempotencyKey: { type: String, required: true, trim: true, select: false },
    requestHash: { type: String, required: true, trim: true, select: false },
    publishedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

storySchema.index(
  { visibility: 1, status: 1, expiresAt: 1, publishedAt: -1, _id: -1 },
  { name: 'ix_stories_public_feed' },
);
storySchema.index(
  { publishedAt: -1, _id: -1 },
  { name: 'ix_stories_published_at_id' },
);
storySchema.index(
  { ownerId: 1, publishedAt: -1 },
  { name: 'ix_stories_owner_published_at' },
);
storySchema.index(
  { ownerId: 1, idempotencyKey: 1 },
  { unique: true, name: 'uq_stories_owner_idempotency_key' },
);
storySchema.index(
  { 'media.mediaAssetId': 1 },
  { unique: true, name: 'uq_stories_media_asset_id' },
);
storySchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'ttl_stories_expires_at' },
);

export const StoryModel: Model<Story> =
  (mongoose.models.Story as Model<Story> | undefined) ?? model<Story>('Story', storySchema);
