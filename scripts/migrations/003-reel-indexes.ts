import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../../src/infrastructure/logger/logger.js';
import { MediaAssetModel } from '../../src/modules/media-assets/media-asset.model.js';
import { ReelModel } from '../../src/modules/reels/reel.model.js';
import { ReelReportModel } from '../../src/modules/reels/reel-report.model.js';

try {
  await connectDatabase();
  await Promise.all([
    MediaAssetModel.createIndexes(),
    ReelModel.createIndexes(),
    ReelReportModel.createIndexes(),
  ]);
  logger.info('Reel media indexes are ready');
} catch (error) {
  logger.error({ err: error }, 'Reel media index migration failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
