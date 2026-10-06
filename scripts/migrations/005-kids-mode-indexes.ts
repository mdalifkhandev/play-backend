import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../../src/infrastructure/logger/logger.js';
import { KidsModeModel } from '../../src/modules/kids-mode/kids-mode.model.js';
import { ReelModel } from '../../src/modules/reels/reel.model.js';

try {
  await connectDatabase();
  await Promise.all([KidsModeModel.createIndexes(), ReelModel.createIndexes()]);
  logger.info('Kids Mode and kids feed indexes are ready');
} catch (error) {
  logger.error({ err: error }, 'Kids Mode index migration failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
