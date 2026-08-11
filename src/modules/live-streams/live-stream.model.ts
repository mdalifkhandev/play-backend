import mongoose, { type Document, Schema } from 'mongoose';

import { LIVE_STREAM_STATUS, type LiveStreamStatus } from './live-stream.constants.js';

export interface ILiveStream extends Document {
  hostId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  coverImage?: string;
  status: LiveStreamStatus;
  channelName: string;
  streamKey: string;
  viewerCount: number;
  peakViewerCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  giftsCount: number;
  category?: string;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const liveStreamSchema = new Schema<ILiveStream>(
  {
    hostId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    coverImage: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(LIVE_STREAM_STATUS),
      default: LIVE_STREAM_STATUS.SCHEDULED,
      index: true,
    },
    channelName: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    streamKey: {
      type: String,
      required: true,
      select: false,
    },
    viewerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    peakViewerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sharesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    giftsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

liveStreamSchema.index({ status: 1, startedAt: -1 });
liveStreamSchema.index({ status: 1, likesCount: -1 });
liveStreamSchema.index({ status: 1, viewerCount: -1 });

export const LiveStreamModel = mongoose.model<ILiveStream>('LiveStream', liveStreamSchema);
