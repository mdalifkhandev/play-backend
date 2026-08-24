import { Types } from 'mongoose';

import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { AppError } from '../../common/errors/app-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { CommentModel } from '../engagement/comment/comment.model.js';
import { adminNotificationService } from '../notifications/admin-notification.service.js';
import { ReelStatus } from '../reels/reel.constants.js';
import { ReelModel } from '../reels/reel.model.js';
import { LiveStreamModel } from '../live-streams/live-stream.model.js';
import { UserModel } from '../users/user.model.js';
import {
  ModerationReportModel,
  type ModerationReportAction,
  type ModerationReportReason,
  type ModerationTargetType,
} from './moderation-report.model.js';
import type { AdminListModerationReportsQuery } from './moderation.validation.js';

export class ModerationService {
  async report(
    targetType: ModerationTargetType,
    targetId: string,
    reporterId: string,
    reason: ModerationReportReason,
    details?: string,
  ): Promise<{ reported: boolean }> {
    const ownerId = await this.resolveOwnerId(targetType, targetId);
    const result = await ModerationReportModel.updateOne(
      { targetType, targetId, reporterId },
      {
        $setOnInsert: {
          targetType,
          targetId: new Types.ObjectId(targetId),
          reporterId: new Types.ObjectId(reporterId),
          ...(ownerId ? { ownerId } : {}),
          reason,
          ...(details ? { details } : {}),
          status: 'pending',
          action: 'none',
        },
      },
      { upsert: true },
    ).exec();

    const reported = result.upsertedCount === 1;
    void adminNotificationService.notifyAdmins({
      event: 'moderation_report_submitted',
      title: reported ? 'New content report' : 'Content report repeated',
      body: `${targetType} was reported for ${reason}.`,
      relatedEntityId: targetId,
    });

    return { reported };
  }

  async listForAdmin(query: AdminListModerationReportsQuery) {
    const filter: Record<string, unknown> = { status: query.status };
    if (query.targetType) filter.targetType = query.targetType;

    const skip = (query.page - 1) * query.limit;
    const [reports, total] = await Promise.all([
      ModerationReportModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .populate('reporterId', 'email profile.username profile.displayName profile.photoUrl')
        .populate('ownerId', 'email profile.username profile.displayName profile.photoUrl')
        .lean()
        .exec(),
      ModerationReportModel.countDocuments(filter),
    ]);

    const items = await Promise.all(reports.map(async (report) => this.mapAdminReport(report as any)));

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async review(reportId: string, reviewerId: string, action: ModerationReportAction, reason?: string) {
    const report = await ModerationReportModel.findById(reportId).exec();
    if (!report) {
      throw new NotFoundError('Report was not found.', { code: 'REPORT_NOT_FOUND' });
    }

    if (action === 'remove') await this.removeContent(report.targetType, report.targetId.toString());
    if (action === 'suspend' && report.ownerId) await this.updateUserStatus(report.ownerId.toString(), AccountStatus.SUSPENDED);
    if (action === 'ban' && report.ownerId) await this.updateUserStatus(report.ownerId.toString(), AccountStatus.DELETED);

    report.status = action === 'keep' ? 'rejected' : 'resolved';
    report.action = action;
    if (reason) report.adminReason = reason;
    report.reviewedBy = new Types.ObjectId(reviewerId);
    report.reviewedAt = new Date();
    await report.save();

    return { id: report._id.toString(), status: report.status, action: report.action };
  }

  private async resolveOwnerId(targetType: ModerationTargetType, targetId: string): Promise<Types.ObjectId | undefined> {
    if (targetType === 'reel') {
      const reel = await ReelModel.findById(targetId).select('ownerId').lean<{ ownerId: Types.ObjectId }>().exec();
      if (!reel) throw new NotFoundError('Reel was not found.', { code: 'REEL_NOT_FOUND' });
      return reel.ownerId;
    }

    if (targetType === 'comment') {
      const comment = await CommentModel.findById(targetId).select('authorId').lean<{ authorId: Types.ObjectId }>().exec();
      if (!comment) throw new NotFoundError('Comment was not found.', { code: 'COMMENT_NOT_FOUND' });
      return comment.authorId;
    }

    if (targetType === 'live_stream') {
      const stream = await LiveStreamModel.findById(targetId).select('hostId').lean<{ hostId: Types.ObjectId }>().exec();
      if (!stream) throw new NotFoundError('Live stream was not found.', { code: 'LIVE_STREAM_NOT_FOUND' });
      return stream.hostId;
    }

    const user = await UserModel.findById(targetId).select('_id').lean<{ _id: Types.ObjectId }>().exec();
    if (!user) throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    return user._id;
  }

  private async removeContent(targetType: ModerationTargetType, targetId: string): Promise<void> {
    if (targetType === 'reel') {
      await ReelModel.updateOne({ _id: targetId }, { $set: { status: ReelStatus.DELETED, deletedAt: new Date() } }).exec();
      return;
    }

    if (targetType === 'comment') {
      await CommentModel.updateOne({ _id: targetId }, { $set: { status: 'deleted', deletedAt: new Date() } }).exec();
      return;
    }

    if (targetType === 'user' || targetType === 'profile') {
      await this.updateUserStatus(targetId, AccountStatus.SUSPENDED);
      return;
    }

    if (targetType === 'live_stream') {
      await LiveStreamModel.updateOne({ _id: targetId }, { $set: { status: 'ENDED', endedAt: new Date() } }).exec();
      return;
    }

    throw new AppError('Unsupported moderation target.', 400, { code: 'UNSUPPORTED_TARGET' });
  }

  private async updateUserStatus(userId: string, status: AccountStatus): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { $set: { status } }).exec();
  }

  private async mapAdminReport(report: any) {
    const [content, reportCount] = await Promise.all([
      this.loadContentSummary(report.targetType, report.targetId),
      ModerationReportModel.countDocuments({
        targetType: report.targetType,
        targetId: report.targetId,
      }),
    ]);

    return {
      id: report._id.toString(),
      targetType: report.targetType,
      targetId: report.targetId.toString(),
      reason: report.reason,
      details: report.details,
      status: report.status,
      action: report.action,
      reportCount,
      createdAt: report.createdAt.toISOString(),
      reporter: mapUser(report.reporterId),
      owner: mapUser(report.ownerId),
      content,
    };
  }

  private async loadContentSummary(targetType: ModerationTargetType, targetId: Types.ObjectId) {
    if (targetType === 'reel') {
      const reel = await ReelModel.findById(targetId).select('caption thumbnailUrl playbackUrl videoUrl mediaUrl ownerId createdAt').lean().exec();
      return {
        title: reel?.caption || 'Reported reel',
        thumbnailUrl: (reel as any)?.thumbnailUrl,
        mediaUrl: (reel as any)?.playbackUrl || (reel as any)?.videoUrl || (reel as any)?.mediaUrl,
      };
    }

    if (targetType === 'comment') {
      const comment = await CommentModel.findById(targetId).select('text targetId authorId createdAt').lean().exec();
      return {
        title: comment?.text || 'Reported comment',
      };
    }

    if (targetType === 'live_stream') {
      const stream = await LiveStreamModel.findById(targetId).select('title coverImage status viewerCount peakViewerCount startedAt endedAt').lean().exec();
      return {
        title: stream?.title || 'Reported live stream',
        thumbnailUrl: stream?.coverImage,
        description: stream ? `${stream.status} · ${stream.viewerCount ?? 0} watching · Peak ${stream.peakViewerCount ?? 0}` : undefined,
      };
    }

    const user = await UserModel.findById(targetId).select('email profile.username profile.displayName profile.photoUrl profile.bio').lean().exec();
    return {
      title: user?.profile?.displayName || user?.profile?.username || user?.email || 'Reported user',
      thumbnailUrl: user?.profile?.photoUrl,
      description: user?.profile?.bio,
    };
  }
}

function mapUser(user: any) {
  if (!user) return undefined;
  return {
    id: user._id?.toString(),
    email: user.email,
    displayName: user.profile?.displayName || user.profile?.username || user.email,
    username: user.profile?.username,
    photoUrl: user.profile?.photoUrl,
  };
}

export const moderationService = new ModerationService();
