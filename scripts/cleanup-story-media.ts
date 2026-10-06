import { env } from '../src/config/env.config.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../src/infrastructure/logger/logger.js';
import { mediaAssetCleanupService } from '../src/modules/media-assets/media-asset-cleanup.service.js';

function readBatchSize(): number {
  const flag = process.argv.find((argument) => argument.startsWith('--batch-size='));
  const value = flag ? Number(flag.split('=')[1]) : env.STORY_CLEANUP_BATCH_SIZE;
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 500) : env.STORY_CLEANUP_BATCH_SIZE;
}

try {
  await connectDatabase();
  const result = await mediaAssetCleanupService.run({
    dryRun: process.argv.includes('--dry-run'),
    batchSize: readBatchSize(),
  });
  logger.info(result, 'Story media cleanup finished');
} catch (error) {
  logger.error({ err: error }, 'Story media cleanup failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
