import type { ClientSession, Types } from 'mongoose';

import {
  MediaAssetAttachmentStatus,
  MediaAssetPurpose,
  MediaAssetUploadStatus,
  type MediaType,
} from './media-asset.constants.js';
import { MediaAssetModel, type MediaAssetDocument } from './media-asset.model.js';

interface CreatePendingMediaAssetInput {
  ownerId: string;
  publicId: string;
  mediaType: MediaType;
  purpose: MediaAssetPurpose;
  mimeType: string;
  declaredFileSizeBytes: number;
  uploadSignatureId: string;
  expiresAt: Date;
  originalFileName?: string | undefined;
}

export interface VerifyMediaAssetInput {
  providerAssetId: string;
  version: number;
  secureUrl: string;
  thumbnailUrl: string;
  mimeType: string;
  format?: string | undefined;
  fileSizeBytes: number;
  width: number;
  height: number;
  durationSeconds?: number | undefined;
  hasAudio?: boolean | undefined;
  expiresAt: Date;
  verifiedAt: Date;
}

export class MediaAssetRepository {
  async createPending(input: CreatePendingMediaAssetInput): Promise<MediaAssetDocument> {
    const payload = {
      ownerId: input.ownerId,
      publicId: input.publicId,
      mediaType: input.mediaType,
      purpose: input.purpose,
      mimeType: input.mimeType,
      declaredFileSizeBytes: input.declaredFileSizeBytes,
      uploadSignatureId: input.uploadSignatureId,
      expiresAt: input.expiresAt,
      provider: 'cloudinary' as const,
      resourceType: input.mediaType,
      deliveryType: 'upload' as const,
      uploadStatus: MediaAssetUploadStatus.PENDING,
      attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
      ...(input.originalFileName ? { originalFileName: input.originalFileName } : {}),
    };

    return MediaAssetModel.create(payload);
  }

  async findById(
    id: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<MediaAssetDocument | null> {
    const query = MediaAssetModel.findById(id);
    if (session) query.session(session);
    return query.exec();
  }

  async findByPublicId(
    publicId: string,
    session?: ClientSession,
  ): Promise<MediaAssetDocument | null> {
    const query = MediaAssetModel.findOne({ publicId });
    if (session) query.session(session);
    return query.exec();
  }

  async markExpired(id: string): Promise<void> {
    await MediaAssetModel.updateOne(
      { _id: id, uploadStatus: MediaAssetUploadStatus.PENDING },
      { $set: { uploadStatus: MediaAssetUploadStatus.EXPIRED } },
    ).exec();
  }

  async markVerified(
    id: string,
    ownerId: string,
    input: VerifyMediaAssetInput,
  ): Promise<MediaAssetDocument | null> {
    return MediaAssetModel.findOneAndUpdate(
      {
        _id: id,
        ownerId,
        uploadStatus: MediaAssetUploadStatus.PENDING,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
      },
      {
        $set: {
          ...input,
          uploadStatus: MediaAssetUploadStatus.VERIFIED,
        },
      },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }

  async attachToStory(
    id: string | Types.ObjectId,
    ownerId: string,
    storyId: Types.ObjectId,
    cleanupEligibleAt: Date,
    session: ClientSession,
  ): Promise<boolean> {
    const result = await MediaAssetModel.updateOne(
      {
        _id: id,
        ownerId,
        uploadStatus: MediaAssetUploadStatus.VERIFIED,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
        attachedStoryId: { $exists: false },
        attachedReelId: { $exists: false },
        $or: [
          { purpose: MediaAssetPurpose.STORY },
          { purpose: { $exists: false } },
        ],
      },
      {
        $set: {
          purpose: MediaAssetPurpose.STORY,
          attachmentStatus: MediaAssetAttachmentStatus.ATTACHED,
          attachedStoryId: storyId,
          cleanupEligibleAt,
        },
      },
      { session, runValidators: true },
    ).exec();

    return result.modifiedCount === 1;
  }

  async attachToReel(
    id: string | Types.ObjectId,
    ownerId: string,
    reelId: Types.ObjectId,
    session: ClientSession,
  ): Promise<boolean> {
    const result = await MediaAssetModel.updateOne(
      {
        _id: id,
        ownerId,
        purpose: MediaAssetPurpose.REEL,
        uploadStatus: MediaAssetUploadStatus.VERIFIED,
        attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
        attachedStoryId: { $exists: false },
        attachedReelId: { $exists: false },
      },
      {
        $set: {
          attachmentStatus: MediaAssetAttachmentStatus.ATTACHED,
          attachedReelId: reelId,
        },
      },
      { session, runValidators: true },
    ).exec();

    return result.modifiedCount === 1;
  }

  async makeCleanupEligible(
    id: string | Types.ObjectId,
    cleanupEligibleAt: Date,
    session: ClientSession,
  ): Promise<void> {
    await MediaAssetModel.updateOne(
      { _id: id },
      { $set: { cleanupEligibleAt } },
      { session },
    ).exec();
  }

  async findCleanupCandidates(now: Date, limit: number): Promise<MediaAssetDocument[]> {
    return MediaAssetModel.find({
      $or: [
        {
          attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
          expiresAt: { $lte: now },
        },
        {
          attachmentStatus: MediaAssetAttachmentStatus.ATTACHED,
          cleanupEligibleAt: { $lte: now },
        },
      ],
    })
      .sort({ _id: 1 })
      .limit(limit)
      .exec();
  }

  async findExpiredUnattached(
    now: Date,
    limit: number,
    purpose?: MediaAssetPurpose,
  ): Promise<MediaAssetDocument[]> {
    return MediaAssetModel.find({
      attachmentStatus: MediaAssetAttachmentStatus.UNATTACHED,
      expiresAt: { $lte: now },
      ...(purpose ? { purpose } : {}),
    })
      .sort({ _id: 1 })
      .limit(limit)
      .exec();
  }

  async recordCleanupFailure(id: Types.ObjectId): Promise<void> {
    await MediaAssetModel.updateOne(
      { _id: id },
      {
        $inc: { cleanupAttemptCount: 1 },
        $set: { lastCleanupAttemptAt: new Date() },
      },
    ).exec();
  }

  async deleteById(id: Types.ObjectId): Promise<boolean> {
    const result = await MediaAssetModel.deleteOne({ _id: id }).exec();
    return result.deletedCount === 1;
  }
}

export const mediaAssetRepository = new MediaAssetRepository();
