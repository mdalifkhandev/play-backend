import { AdCampaignModel } from '../ads/ad-campaign.model.js';
import { WithdrawalRequestModel } from '../coins/withdrawal-request.model.js';
import { CreatorApplicationModel } from '../creators/creator-application.model.js';
import { LiveStreamModel } from '../live-streams/live-stream.model.js';
import { ModerationReportModel } from '../moderation/moderation-report.model.js';
import { ReelModel } from '../reels/reel.model.js';
import { SupportRequestModel } from '../support-requests/support-request.model.js';
import { UserModel } from '../users/user.model.js';
import type { AdminSearchQuery } from './admin-search.validation.js';

export type AdminSearchPage =
  | 'users'
  | 'creators'
  | 'ads'
  | 'moderation'
  | 'withdrawals'
  | 'live'
  | 'settings';

export interface AdminSearchItem {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  status?: string;
  adminPage: AdminSearchPage;
}

export interface AdminSearchResult {
  users: AdminSearchItem[];
  creators: AdminSearchItem[];
  ads: AdminSearchItem[];
  reports: AdminSearchItem[];
  withdrawals: AdminSearchItem[];
  liveStreams: AdminSearchItem[];
  supportRequests: AdminSearchItem[];
  reels: AdminSearchItem[];
}

export class AdminSearchService {
  async search(query: AdminSearchQuery): Promise<AdminSearchResult> {
    const limit = query.limit;
    const regex = new RegExp(escapeRegex(query.q), 'i');

    const [users, creators, ads, reports, withdrawals, liveStreams, supportRequests, reels] =
      await Promise.all([
        UserModel.find({
          $or: [
            { email: regex },
            { phoneNumber: regex },
            { 'profile.username': regex },
            { 'profile.displayName': regex },
          ],
        })
          .select('email role status profile.username profile.displayName profile.photoUrl createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
        CreatorApplicationModel.find({
          $or: [
            { fullName: regex },
            { email: regex },
            { occupation: regex },
            { contentCategory: regex },
            { status: regex },
          ],
        })
          .select('fullName email status contentCategory occupation createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
        AdCampaignModel.find({
          $or: [
            { title: regex },
            { category: regex },
            { status: regex },
            { city: regex },
            { country: regex },
          ],
        })
          .select('title category status budgetUsd createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
        ModerationReportModel.find({
          $or: [
            { targetType: regex },
            { reason: regex },
            { details: regex },
            { status: regex },
            { action: regex },
          ],
        })
          .select('targetType reason status action createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
        WithdrawalRequestModel.find({
          $or: [
            { status: regex },
            { currency: regex },
            { stripeConnectAccountId: regex },
            { stripeTransferId: regex },
          ],
        })
          .select('coins amountUsd currency status createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
        LiveStreamModel.find({
          $or: [
            { title: regex },
            { description: regex },
            { category: regex },
            { status: regex },
            { channelName: regex },
          ],
        })
          .select('title status category viewerCount startedAt createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
        SupportRequestModel.find({
          $or: [
            { ticketNumber: regex },
            { category: regex },
            { subject: regex },
            { status: regex },
            { priority: regex },
          ],
        })
          .select('ticketNumber subject status priority category createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
        ReelModel.find({
          $or: [
            { caption: regex },
            { status: regex },
            { hashtags: regex },
          ],
        })
          .select('caption status viewCount likeCount createdAt')
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .exec(),
      ]);

    return {
      users: users.map((user) => ({
        id: user._id.toString(),
        type: 'User',
        title: user.profile?.displayName || user.profile?.username || user.email,
        subtitle: user.email,
        status: user.status,
        adminPage: 'users',
      })),
      creators: creators.map((creator) => ({
        id: creator._id.toString(),
        type: 'Creator',
        title: creator.fullName || creator.email,
        subtitle: `${creator.email} · ${creator.contentCategory}`,
        status: creator.status,
        adminPage: 'creators',
      })),
      ads: ads.map((ad) => ({
        id: ad._id.toString(),
        type: 'Ad',
        title: ad.title || ad.category,
        subtitle: `${ad.category} · $${ad.budgetUsd}`,
        status: ad.status,
        adminPage: 'ads',
      })),
      reports: reports.map((report) => ({
        id: report._id.toString(),
        type: 'Report',
        title: `${report.targetType} report`,
        subtitle: report.reason,
        status: report.status,
        adminPage: 'moderation',
      })),
      withdrawals: withdrawals.map((withdrawal) => ({
        id: withdrawal._id.toString(),
        type: 'Withdrawal',
        title: `${withdrawal.coins} coins`,
        subtitle: `$${withdrawal.amountUsd} ${withdrawal.currency.toUpperCase()}`,
        status: withdrawal.status,
        adminPage: 'withdrawals',
      })),
      liveStreams: liveStreams.map((stream) => ({
        id: stream._id.toString(),
        type: 'Live',
        title: stream.title,
        subtitle: stream.category || 'Live stream',
        status: stream.status,
        adminPage: 'live',
      })),
      supportRequests: supportRequests.map((request) => ({
        id: request._id.toString(),
        type: 'Support',
        title: request.subject,
        subtitle: request.ticketNumber,
        status: request.status,
        adminPage: 'settings',
      })),
      reels: reels.map((reel) => ({
        id: reel._id.toString(),
        type: 'Reel',
        title: reel.caption || 'Untitled reel',
        subtitle: `${reel.viewCount ?? 0} views · ${reel.likeCount ?? 0} likes`,
        status: reel.status,
        adminPage: 'moderation',
      })),
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const adminSearchService = new AdminSearchService();
