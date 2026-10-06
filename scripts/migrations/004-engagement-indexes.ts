/**
 * Migration 004 – Create indexes for the Engagement module.
 *
 * Idempotent: createIndexes() is a no-op when indexes already exist.
 *
 * Run:
 *   npx tsx scripts/migrations/004-engagement-indexes.ts
 */
import mongoose from 'mongoose';

import { env } from '../../src/config/env.config.js';
import { CommentModel } from '../../src/modules/engagement/comment/comment.model.js';
import { LikeModel } from '../../src/modules/engagement/like.model.js';
import { SaveModel } from '../../src/modules/engagement/save.model.js';
import { ShareModel } from '../../src/modules/engagement/share.model.js';

async function main(): Promise<void> {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected.');

  console.log('Ensuring Like indexes…');
  await LikeModel.createIndexes();

  console.log('Ensuring Save indexes…');
  await SaveModel.createIndexes();

  console.log('Ensuring Share indexes…');
  await ShareModel.createIndexes();

  console.log('Ensuring Comment indexes…');
  await CommentModel.createIndexes();

  console.log('Migration 004 complete.');
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Migration 004 failed:', error);
  process.exit(1);
});
