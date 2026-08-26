/**
 * Migration 007 - Backfill precomputed For You ranking scores.
 *
 * Idempotent: rerunning recalculates rankingScore from current counters.
 *
 * Run:
 *   npm run migrate:feed-ranking
 */
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/mongoose.connection.js';
import { logger } from '../../src/infrastructure/logger/logger.js';
import { Types } from 'mongoose';
import { ReelStatus, ReelVisibility } from '../../src/modules/reels/reel.constants.js';
import { ReelModel } from '../../src/modules/reels/reel.model.js';
import { calculateReelRankingScore } from '../../src/modules/reels/reel.repository.js';

const BATCH_SIZE = 500;

try {
  await connectDatabase();

  let processed = 0;
  let lastId: string | undefined;

  while (true) {
    const reels = await ReelModel.find({
      status: ReelStatus.READY,
      visibility: ReelVisibility.PUBLIC,
      deletedAt: { $exists: false },
      ...(lastId ? { _id: { $gt: lastId } } : {}),
    })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select('viewCount likeCount commentCount saveCount shareCount publishedAt createdAt')
      .lean<
        Array<{
          _id: Types.ObjectId;
          viewCount?: number;
          likeCount?: number;
          commentCount?: number;
          saveCount?: number;
          shareCount?: number;
          publishedAt?: Date;
          createdAt?: Date;
        }>
      >()
      .exec();

    if (reels.length === 0) break;

    await ReelModel.bulkWrite(
      reels.map((reel) => ({
        updateOne: {
          filter: { _id: reel._id },
          update: {
            $set: {
              rankingScore: calculateReelRankingScore(reel),
            },
          },
        },
      })),
      { ordered: false },
    );

    processed += reels.length;
    lastId = reels.at(-1)?._id.toString();
    logger.info({ processed }, 'Feed ranking scores backfilled');
  }

  logger.info({ processed }, 'Feed ranking precompute migration completed');
} catch (error) {
  logger.error({ err: error }, 'Feed ranking precompute migration failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
