import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../src/infrastructure/logger/logger.js';
import { cloudinaryStorage } from '../src/infrastructure/storage/index.js';
import { MediaAssetPurpose } from '../src/modules/media-assets/media-asset.constants.js';
import {
  mediaAssetCleanupService,
} from '../src/modules/media-assets/media-asset-cleanup.service.js';
import { mediaAssetRepository } from '../src/modules/media-assets/media-asset.repository.js';
import { reelRepository } from '../src/modules/reels/reel.repository.js';
import { env } from '../src/config/env.config.js';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const batchSize = Number(
  process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ??
    env.REEL_CLEANUP_BATCH_SIZE,
);

try {
  await connectDatabase();

  const mediaCleanup = await mediaAssetCleanupService.run({ dryRun, batchSize });
  const expiredRaw = await mediaAssetRepository.findExpiredUnattached(
    new Date(),
    batchSize,
    MediaAssetPurpose.REEL,
  );
  const deletedReels = await reelRepository.findDeletedCleanupCandidates(batchSize);

  let processedDeleted = 0;
  let processedFailed = 0;

  for (const reel of deletedReels) {
    if (dryRun) {
      processedDeleted += 1;
      continue;
    }

    try {
      if (reel.processedMedia) {
        await cloudinaryStorage.deleteAsset(reel.processedMedia.publicId, {
          resourceType: 'video',
          invalidate: true,
        });
      }

      if (reel.thumbnail) {
        await cloudinaryStorage.deleteAsset(reel.thumbnail.publicId, {
          resourceType: 'image',
          invalidate: true,
        });
      }

      await reelRepository.clearProcessedAssets(reel._id);
      processedDeleted += 1;
    } catch (error) {
      processedFailed += 1;
      logger.warn({ err: error, reelId: reel._id.toString() }, 'Deleted Reel asset cleanup failed');
    }
  }

  if (!dryRun) {
    await rm(path.resolve(env.MEDIA_TEMP_DIRECTORY), { recursive: true, force: true }).catch(
      () => undefined,
    );
  }

  logger.info(
    {
      dryRun,
      mediaCleanup,
      expiredUnattachedReelAssets: expiredRaw.length,
      deletedReelAssetsCleared: processedDeleted,
      deletedReelAssetsFailed: processedFailed,
    },
    'Reel cleanup completed',
  );
} catch (error) {
  logger.error({ err: error }, 'Reel cleanup failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
