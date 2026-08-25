import { Types } from 'mongoose';

import { AdCampaignModel } from '../ads/ad-campaign.model.js';
import { CoinTransactionModel } from '../coins/coin-transaction.model.js';
import { WithdrawalRequestModel } from '../coins/withdrawal-request.model.js';
import { CreatorRequirementSettingModel } from '../creators/creator-requirement-setting.model.js';
import { SubscriptionPaymentModel } from '../subscriptions/subscription-payment.model.js';
import { UserModel } from '../users/user.model.js';
import { creatorEarningService } from './creator-earning.service.js';
import { CreatorEarningModel } from './creator-earning.model.js';
import { MonetizationSettingModel } from './monetization-setting.model.js';
import type {
  UpdateCreatorRequirementSettingsInput,
  UpdateMonetizationSettingsInput,
} from './monetization.validation.js';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];

export class MonetizationService {
  async getDashboard() {
    const [setting, adRevenue, coinRevenue, subscriptionRevenue, payouts, creatorRows] = await Promise.all([
      this.getSetting(),
      this.sumAdRevenue(),
      this.sumCoinRevenue({ excludeProvider: 'diamond_conversion' }),
      this.sumSubscriptionRevenue(),
      this.sumPayouts(),
      this.getCreatorEarnings(),
    ]);

    const totalRevenue = adRevenue + coinRevenue + subscriptionRevenue;
    const breakdown = [
      { name: 'Ad Revenue', value: adRevenue },
      { name: 'Coin Purchases', value: coinRevenue },
      { name: 'Premium Subscription', value: subscriptionRevenue },
    ];

    return {
      summary: {
        totalRevenue,
        adRevenue,
        coinRevenue,
        subscriptionRevenue,
        pendingPayouts: payouts.pending,
        completedPayouts: payouts.completed,
      },
      revenueBreakdown: toPercentBreakdown(breakdown),
      creatorEarnings: creatorRows,
      settings: {
        creatorSharePercent: setting.creatorSharePercent,
        adminSharePercent: 100 - setting.creatorSharePercent,
      },
      creatorRequirements: await this.getCreatorRequirementSettings(),
      revenueTrend: await this.getRevenueTrend(),
    };
  }

  async updateSettings(adminUserId: string, input: UpdateMonetizationSettingsInput) {
    const setting = await MonetizationSettingModel.findOneAndUpdate(
      {},
      {
        $set: {
          creatorSharePercent: input.creatorSharePercent,
          updatedBy: new Types.ObjectId(adminUserId),
        },
      },
      { new: true, upsert: true, runValidators: true },
    ).exec();

    return {
      creatorSharePercent: setting.creatorSharePercent,
      adminSharePercent: 100 - setting.creatorSharePercent,
    };
  }

  async updateCreatorRequirements(adminUserId: string, input: UpdateCreatorRequirementSettingsInput) {
    const setting = await CreatorRequirementSettingModel.findOneAndUpdate(
      {},
      {
        $set: {
          ...input,
          updatedBy: new Types.ObjectId(adminUserId),
        },
      },
      { new: true, upsert: true, runValidators: true },
    ).exec();

    return mapCreatorRequirementSettings(setting);
  }

  async releasePendingEarnings() {
    const released = await creatorEarningService.releaseAvailablePendingEarnings();
    return { released };
  }

  private async getSetting() {
    let setting = await MonetizationSettingModel.findOne().exec();
    if (!setting) {
      setting = await MonetizationSettingModel.create({ creatorSharePercent: 60 });
    }
    return setting;
  }

  private async getCreatorRequirementSettings() {
    let setting = await CreatorRequirementSettingModel.findOne().exec();
    if (!setting) {
      setting = await CreatorRequirementSettingModel.create({});
    }

    return mapCreatorRequirementSettings(setting);
  }

  private async sumAdRevenue() {
    const [result] = await AdCampaignModel.aggregate<{ total: number }>([
      { $match: { status: { $in: ['approved', 'active', 'paused', 'completed'] } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$metrics.spendUsd', 0] } } } },
    ]).exec();

    return Number(result?.total ?? 0);
  }

  private async sumCoinRevenue({ excludeProvider }: { excludeProvider?: string } = {}) {
    const match: Record<string, unknown> = { status: 'completed' };
    if (excludeProvider) match.paymentProvider = { $ne: excludeProvider };

    const [result] = await CoinTransactionModel.aggregate<{ total: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).exec();

    return Number(result?.total ?? 0);
  }

  private async sumSubscriptionRevenue() {
    const [result] = await SubscriptionPaymentModel.aggregate<{ total: number }>([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).exec();

    return Number(result?.total ?? 0);
  }

  private async sumPayouts() {
    const [withdrawals, earnings] = await Promise.all([
      WithdrawalRequestModel.aggregate<{ _id: string; total: number }>([
      { $group: { _id: '$status', total: { $sum: '$amountUsd' } } },
      ]).exec(),
      CreatorEarningModel.aggregate<{ _id: string; total: number }>([
        { $group: { _id: '$status', total: { $sum: '$amountUsd' } } },
      ]).exec(),
    ]);

    const payoutTotals = withdrawals.reduce(
      (acc, row) => {
        if (row._id === 'pending') acc.pending += row.total;
        if (['approved', 'transferred'].includes(row._id)) acc.completed += row.total;
        return acc;
      },
      { pending: 0, completed: 0 },
    );

    earnings.forEach((row) => {
      if (row._id === 'pending' || row._id === 'held') payoutTotals.pending += row.total;
      if (row._id === 'available' || row._id === 'paid') payoutTotals.completed += row.total;
    });

    return payoutTotals;
  }

  private async getCreatorEarnings() {
    const rows = await CreatorEarningModel.aggregate<{
      _id: Types.ObjectId;
      total: number;
      thisMonth: number;
      pending: number;
      available: number;
    }>([
      {
        $group: {
          _id: '$userId',
          total: { $sum: '$amountUsd' },
          thisMonth: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', monthStart()] }, '$amountUsd', 0],
            },
          },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]).exec();

    const users = await UserModel.find({ _id: { $in: rows.map((row) => row._id) } })
      .select('email profile.username profile.displayName')
      .lean()
      .exec();
    const usersById = new Map(users.map((user) => [user._id.toString(), user]));

    return rows.map((row) => {
      const user = usersById.get(row._id.toString());
      return {
        id: row._id.toString(),
        name: user?.profile?.displayName || user?.profile?.username || user?.email || 'Creator',
        total: Number(row.total.toFixed(2)),
        thisMonth: Number(row.thisMonth.toFixed(2)),
        payout: row.pending > 0 ? 'Pending' : row.available > 0 ? 'Available' : 'Processing',
      };
    });
  }

  private async getRevenueTrend() {
    const [ads, coins, subscriptions] = await Promise.all([
      AdCampaignModel.aggregate<{ month: string; revenue: number }>([
        { $match: { status: { $in: ['approved', 'active', 'paused', 'completed'] } } },
        {
          $group: {
            _id: { $dateToString: { format: '%b', date: '$createdAt' } },
            revenue: { $sum: { $ifNull: ['$metrics.spendUsd', 0] } },
          },
        },
        { $project: { _id: 0, month: '$_id', revenue: 1 } },
      ]).exec(),
      CoinTransactionModel.aggregate<{ month: string; revenue: number }>([
        { $match: { status: 'completed', paymentProvider: { $ne: 'diamond_conversion' } } },
        {
          $group: {
            _id: { $dateToString: { format: '%b', date: '$createdAt' } },
            revenue: { $sum: '$amount' },
          },
        },
        { $project: { _id: 0, month: '$_id', revenue: 1 } },
      ]).exec(),
      SubscriptionPaymentModel.aggregate<{ month: string; revenue: number }>([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: { $dateToString: { format: '%b', date: '$completedAt' } },
            revenue: { $sum: '$amount' },
          },
        },
        { $project: { _id: 0, month: '$_id', revenue: 1 } },
      ]).exec(),
    ]);

    const totals = new Map(months.map((month) => [month, 0]));
    [...ads, ...coins, ...subscriptions].forEach((row) => {
      if (totals.has(row.month)) totals.set(row.month, (totals.get(row.month) ?? 0) + row.revenue);
    });

    return months.map((month) => ({ month, revenue: Number((totals.get(month) ?? 0).toFixed(2)) }));
  }
}

export const monetizationService = new MonetizationService();

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function toPercentBreakdown(rows: { name: string; value: number }[]) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) {
    return rows.map((row) => ({ name: row.name, value: 0, amount: 0 }));
  }

  return rows.map((row) => ({
    name: row.name,
    value: Math.round((row.value / total) * 100),
    amount: Number(row.value.toFixed(2)),
  }));
}

function mapCreatorRequirementSettings(setting: {
  profileEnabled?: boolean;
  followers: number;
  followersEnabled?: boolean;
  views: number;
  viewsEnabled?: boolean;
  watchTimeMinutes: number;
  watchTimeEnabled?: boolean;
  likes: number;
  likesEnabled?: boolean;
  accountAgeDays: number;
  accountAgeEnabled?: boolean;
  reels: number;
  reelsEnabled?: boolean;
  reportLimit: number;
  guidelinesEnabled?: boolean;
}) {
  return {
    profileEnabled: setting.profileEnabled ?? true,
    followers: setting.followers,
    followersEnabled: setting.followersEnabled ?? true,
    views: setting.views,
    viewsEnabled: setting.viewsEnabled ?? true,
    watchTimeMinutes: setting.watchTimeMinutes,
    watchTimeEnabled: setting.watchTimeEnabled ?? false,
    likes: setting.likes,
    likesEnabled: setting.likesEnabled ?? false,
    accountAgeDays: setting.accountAgeDays,
    accountAgeEnabled: setting.accountAgeEnabled ?? true,
    reels: setting.reels,
    reelsEnabled: setting.reelsEnabled ?? false,
    reportLimit: setting.reportLimit,
    guidelinesEnabled: setting.guidelinesEnabled ?? true,
  };
}
