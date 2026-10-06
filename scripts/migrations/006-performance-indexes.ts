/**
 * Migration 006 - Create performance indexes used by feed, notifications,
 * wallet, subscriptions, ads, and live management queries.
 *
 * Idempotent: createIndexes() skips indexes that already exist.
 *
 * Run:
 *   npm run migrate:performance-indexes
 */
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../../src/infrastructure/logger/logger.js';
import { AdCampaignModel } from '../../src/modules/ads/ad-campaign.model.js';
import { CoinTransactionModel } from '../../src/modules/coins/coin-transaction.model.js';
import { WithdrawalRequestModel } from '../../src/modules/coins/withdrawal-request.model.js';
import { CommentModel } from '../../src/modules/engagement/comment/comment.model.js';
import { LikeModel } from '../../src/modules/engagement/like.model.js';
import { SaveModel } from '../../src/modules/engagement/save.model.js';
import { ShareModel } from '../../src/modules/engagement/share.model.js';
import { LiveStreamModel } from '../../src/modules/live-streams/live-stream.model.js';
import { NotificationModel } from '../../src/modules/notifications/notification.model.js';
import { ReelModel } from '../../src/modules/reels/reel.model.js';
import { ReelViewModel } from '../../src/modules/reels/reel-view.model.js';
import { UserSubscriptionModel } from '../../src/modules/subscriptions/user-subscription.model.js';
import { FollowModel } from '../../src/modules/users/follow.model.js';

const indexTargets = [
  ['Reel', ReelModel],
  ['ReelView', ReelViewModel],
  ['Follow', FollowModel],
  ['Comment', CommentModel],
  ['Like', LikeModel],
  ['Save', SaveModel],
  ['Share', ShareModel],
  ['Notification', NotificationModel],
  ['CoinTransaction', CoinTransactionModel],
  ['WithdrawalRequest', WithdrawalRequestModel],
  ['UserSubscription', UserSubscriptionModel],
  ['AdCampaign', AdCampaignModel],
  ['LiveStream', LiveStreamModel],
] as const;

try {
  await connectDatabase();

  for (const [name, model] of indexTargets) {
    logger.info({ model: name }, 'Ensuring performance indexes');
    await model.createIndexes();
  }

  logger.info('Performance indexes are ready');
} catch (error) {
  logger.error({ err: error }, 'Performance index migration failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
