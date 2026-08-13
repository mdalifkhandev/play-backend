import type { ClientSession, Types } from 'mongoose';

import { ReelModel } from './reel.model.js';
import { ReelReportModel, type ReelReportReason } from './reel-report.model.js';

export class ReelReportRepository {
  async createIfAbsent(
    reelId: Types.ObjectId,
    reporterId: string,
    reason: ReelReportReason,
    details?: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const result = await ReelReportModel.updateOne(
      { reelId, reporterId },
      {
        $setOnInsert: {
          reelId,
          reporterId,
          reason,
          ...(details ? { details } : {}),
        },
      },
      { upsert: true, ...(session ? { session } : {}) },
    ).exec();

    if (result.upsertedCount !== 1) return false;

    await ReelModel.updateOne(
      { _id: reelId },
      { $inc: { reportCount: 1 } },
      session ? { session } : {},
    ).exec();
    return true;
  }

  async listReelIdsReportedBy(reporterId: string): Promise<Types.ObjectId[]> {
    const reports = await ReelReportModel.find({ reporterId })
      .select('reelId')
      .lean<Array<{ reelId: Types.ObjectId }>>()
      .exec();

    return reports.map((report) => report.reelId);
  }
}

export const reelReportRepository = new ReelReportRepository();
