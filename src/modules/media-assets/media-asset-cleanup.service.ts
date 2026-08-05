import { env } from '../../config/env.config.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { cloudinaryStorage, type CloudinaryStorage } from '../../infrastructure/storage/index.js';
import { ReelStatus } from '../reels/reel.constants.js';
import { ReelModel } from '../reels/reel.model.js';
import { StoryStatus } from '../stories/story.constants.js';
import { StoryModel } from '../stories/story.model.js';
import { MediaAssetAttachmentStatus } from './media-asset.constants.js';
import {
  mediaAssetRepository,
  type MediaAssetRepository,
} from './media-asset.repository.js';

export interface CleanupMediaAssetsOptions {
  dryRun?: boolean | undefined;
  batchSize?: number | undefined;
}

export interface CleanupMediaAssetsResult {
  examined: number;
  deleted: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
}

export class MediaAssetCleanupService {
  constructor(
    private readonly repository: MediaAssetRepository = mediaAssetRepository,
    private readonly storage: CloudinaryStorage = cloudinaryStorage,
  ) {}

  async run(options: CleanupMediaAssetsOptions = {}): Promise<CleanupMediaAssetsResult> {
    const now = new Date();
    const batchSize = Math.min(
      options.batchSize ?? env.STORY_CLEANUP_BATCH_SIZE,
      500,
    );
    const dryRun = options.dryRun ?? false;
    const candidates = await this.repository.findCleanupCandidates(now, batchSize);
    const result: CleanupMediaAssetsResult = {
      examined: candidates.length,
      deleted: 0,
      skipped: 0,
      failed: 0,
      dryRun,
    };

    for (const asset of candidates) {
      if (asset.attachmentStatus === MediaAssetAttachmentStatus.ATTACHED) {
        if (asset.attachedStoryId) {
          const hasActiveStory = await StoryModel.exists({
            _id: asset.attachedStoryId,
            status: StoryStatus.ACTIVE,
            expiresAt: { $gt: now },
            deletedAt: { $exists: false },
          });

          if (hasActiveStory) {
            result.skipped += 1;
            continue;
          }
        }

        if (asset.attachedReelId) {
          const hasActiveReel = await ReelModel.exists({
            _id: asset.attachedReelId,
            status: { $ne: ReelStatus.DELETED },
            deletedAt: { $exists: false },
          });

          if (hasActiveReel) {
            result.skipped += 1;
            continue;
          }
        }
      }

      if (dryRun) {
        result.deleted += 1;
        continue;
      }

      try {
        await this.storage.deleteAsset(asset.publicId, {
          resourceType: asset.resourceType,
          invalidate: true,
        });
        await this.repository.deleteById(asset._id);
        result.deleted += 1;
      } catch (error) {
        result.failed += 1;
        await this.repository.recordCleanupFailure(asset._id);
        logger.warn(
          {
            err: error,
            mediaAssetId: asset._id.toString(),
            cleanupAttempt: asset.cleanupAttemptCount + 1,
          },
          'Media asset cleanup failed and will be retried',
        );
      }
    }

    logger.info(result, 'Media asset cleanup batch completed');
    return result;
  }
}

export const mediaAssetCleanupService = new MediaAssetCleanupService();
