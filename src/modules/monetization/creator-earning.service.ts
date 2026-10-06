import { Types } from 'mongoose';

import { logger } from '../../infrastructure/logger/logger.js';
import { CreatorApplicationModel } from '../creators/creator-application.model.js';
import { PlatformSettingModel } from '../platform-settings/platform-setting.model.js';
import { UserModel } from '../users/user.model.js';
import { CreatorEarningModel } from './creator-earning.model.js';
import type { ReelDocument } from '../reels/reel.model.js';

const VIEWS_PER_EARNING_UNIT = 1000;
const DEFAULT_HOLD_DAYS = 7;

export class CreatorEarningService {
  async recordEligibleReelView(reel: ReelDocument, viewCount: number): Promise<void> {
    if (viewCount < VIEWS_PER_EARNING_UNIT || viewCount % VIEWS_PER_EARNING_UNIT !== 0) {
      return;
    }

    const ownerId = reel.ownerId.toString();
    const isApprovedCreator = await CreatorApplicationModel.exists({
      userId: reel.ownerId,
      status: 'approved',
    }).exec();

    if (!isApprovedCreator) {
      return;
    }

    const platformSetting = await PlatformSettingModel.findOne().lean().exec();
    const payoutRateUsd = platformSetting?.payoutPerThousandViewsUsd ?? 0;
    const creatorSharePercent = 100;

    if (payoutRateUsd <= 0) {
      return;
    }

    const grossUsd = payoutRateUsd;
    const amountUsd = Number(grossUsd.toFixed(4));

    if (amountUsd <= 0) {
      return;
    }

    const threshold = Math.floor(viewCount / VIEWS_PER_EARNING_UNIT) * VIEWS_PER_EARNING_UNIT;
    const sourceKey = `reel:${reel._id.toString()}:views:${threshold}`;
    const availableAt = new Date(Date.now() + DEFAULT_HOLD_DAYS * 24 * 60 * 60 * 1000);

    try {
      const created = await CreatorEarningModel.create({
        userId: new Types.ObjectId(ownerId),
        reelId: reel._id,
        source: 'reel_views',
        sourceKey,
        eligibleViews: VIEWS_PER_EARNING_UNIT,
        payoutRateUsd,
        creatorSharePercent,
        grossUsd,
        amountUsd,
        currency: 'usd',
        status: 'pending',
        availableAt,
        metadata: {
          threshold,
          reelViewCount: viewCount,
        },
      });

      await UserModel.findByIdAndUpdate(ownerId, {
        $inc: { pendingBalanceUsd: created.amountUsd },
      }).exec();
    } catch (error: any) {
      if (error?.code === 11000) {
        return;
      }
      logger.warn({ err: error, reelId: reel._id.toString(), ownerId }, 'Failed to record creator reel earning');
    }
  }

  async releaseAvailablePendingEarnings(limit = 500): Promise<number> {
    const now = new Date();
    const earnings = await CreatorEarningModel.find({
      status: 'pending',
      availableAt: { $lte: now },
    })
      .limit(limit)
      .exec();

    let released = 0;

    for (const earning of earnings) {
      const updated = await CreatorEarningModel.findOneAndUpdate(
        { _id: earning._id, status: 'pending' },
        { $set: { status: 'available' } },
        { new: true },
      ).exec();

      if (!updated) continue;

      await UserModel.findByIdAndUpdate(updated.userId, {
        $inc: {
          pendingBalanceUsd: -updated.amountUsd,
          availableBalanceUsd: updated.amountUsd,
        },
      }).exec();
      released += 1;
    }

    return released;
  }
}

export const creatorEarningService = new CreatorEarningService();
