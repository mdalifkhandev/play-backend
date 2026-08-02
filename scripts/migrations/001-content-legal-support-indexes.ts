import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../../src/infrastructure/logger/logger.js';
import { ContentPageModel } from '../../src/modules/content-pages/content-page.model.js';
import { LegalConsentModel } from '../../src/modules/legal-consents/legal-consent.model.js';
import { SupportMessageModel } from '../../src/modules/support-requests/support-message.model.js';
import { SupportRequestModel } from '../../src/modules/support-requests/support-request.model.js';

try {
  await connectDatabase();
  await Promise.all([
    ContentPageModel.createIndexes(),
    LegalConsentModel.createIndexes(),
    SupportRequestModel.createIndexes(),
    SupportMessageModel.createIndexes(),
  ]);
  logger.info('Content, legal consent and support indexes are ready');
} catch (error) {
  logger.error({ err: error }, 'Index migration failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
