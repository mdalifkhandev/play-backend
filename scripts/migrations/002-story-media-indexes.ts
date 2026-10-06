import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../../src/infrastructure/logger/logger.js';
import { MediaAssetModel } from '../../src/modules/media-assets/media-asset.model.js';
import { StoryModel } from '../../src/modules/stories/story.model.js';
import { StoryViewModel } from '../../src/modules/stories/story-view.model.js';

try {
  await connectDatabase();
  await Promise.all([
    MediaAssetModel.createIndexes(),
    StoryModel.createIndexes(),
    StoryViewModel.createIndexes(),
  ]);
  logger.info('Story media indexes are ready');
} catch (error) {
  logger.error({ err: error }, 'Story media index migration failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
