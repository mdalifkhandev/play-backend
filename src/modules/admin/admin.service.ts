import { UserRole } from '../../common/enums/user-role.enum.js';
import { AdCampaignModel } from '../ads/ad-campaign.model.js';
import { CoinTransactionModel } from '../coins/coin-transaction.model.js';
import { CreatorApplicationModel } from '../creators/creator-application.model.js';
import { NotificationModel } from '../notifications/notification.model.js';
import { SessionModel } from '../sessions/session.model.js';
import { SubscriptionPaymentModel } from '../subscriptions/subscription-payment.model.js';
import { UserModel } from '../users/user.model.js';

type DateRange = {
  start: Date;
  end: Date;
};

export type AdminDashboardSummary = {
  totalUsers: number;
  totalCreators: number;
  revenueToday: number;
  revenueThisMonth: number;
  totalUsersChangePercent: number;
  totalCreatorsChangePercent: number;
  revenueTodayChangePercent: number;
  revenueThisMonthChangePercent: number;
  userGrowth: { day: string; users: number }[];
  revenueTrend: { month: string; revenue: number }[];
  activeUsers: { hour: string; active: number }[];
  recentActivity: { id: string; type: 'signup' | 'approval' | 'flag'; text: string; time: string }[];
};

export class AdminService {
  async getDashboardSummary(): Promise<AdminDashboardSummary> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const yesterdayStart = addDays(todayStart, -1);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last30DaysStart = addDays(now, -30);
    const previous30DaysStart = addDays(now, -60);

    const userQuery = { role: { $in: [UserRole.USER, UserRole.CREATOR] } };
    const [
      totalUsers,
      totalCreators,
      recentUsers,
      previousUsers,
      recentCreators,
      previousCreators,
      revenueToday,
      revenueYesterday,
      revenueThisMonth,
      revenuePreviousMonth,
    ] = await Promise.all([
      UserModel.countDocuments(userQuery),
      CreatorApplicationModel.countDocuments({ status: 'approved' }),
      UserModel.countDocuments({ ...userQuery, createdAt: { $gte: last30DaysStart, $lt: now } }),
      UserModel.countDocuments({ ...userQuery, createdAt: { $gte: previous30DaysStart, $lt: last30DaysStart } }),
      CreatorApplicationModel.countDocuments({
        status: 'approved',
        reviewedAt: { $gte: last30DaysStart, $lt: now },
      }),
      CreatorApplicationModel.countDocuments({
        status: 'approved',
        reviewedAt: { $gte: previous30DaysStart, $lt: last30DaysStart },
      }),
      getRevenueForRange({ start: todayStart, end: tomorrowStart }),
      getRevenueForRange({ start: yesterdayStart, end: todayStart }),
      getRevenueForRange({ start: currentMonthStart, end: nextMonthStart }),
      getRevenueForRange({ start: previousMonthStart, end: currentMonthStart }),
    ]);

    return {
      totalUsers,
      totalCreators,
      revenueToday: roundMoney(revenueToday),
      revenueThisMonth: roundMoney(revenueThisMonth),
      totalUsersChangePercent: percentageChange(recentUsers, previousUsers),
      totalCreatorsChangePercent: percentageChange(recentCreators, previousCreators),
      revenueTodayChangePercent: percentageChange(revenueToday, revenueYesterday),
      revenueThisMonthChangePercent: percentageChange(revenueThisMonth, revenuePreviousMonth),
      userGrowth: await getUserGrowth(now),
      revenueTrend: await getRevenueTrend(now),
      activeUsers: await getActiveUsers(now),
      recentActivity: await getRecentActivity(now),
    };
  }
}

async function getRevenueForRange(range: DateRange) {
  const [coinRevenue, subscriptionRevenue, adRevenue] = await Promise.all([
    sumCoinRevenue(range),
    sumSubscriptionRevenue(range),
    sumAdRevenue(range),
  ]);

  return coinRevenue + subscriptionRevenue + adRevenue;
}

async function sumCoinRevenue({ start, end }: DateRange) {
  const [result] = await CoinTransactionModel.aggregate<{ total: number }>([
    {
      $match: {
        status: 'completed',
        paymentProvider: 'stripe',
        $or: [
          { completedAt: { $gte: start, $lt: end } },
          { completedAt: { $exists: false }, createdAt: { $gte: start, $lt: end } },
        ],
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return result?.total ?? 0;
}

async function sumSubscriptionRevenue({ start, end }: DateRange) {
  const [result] = await SubscriptionPaymentModel.aggregate<{ total: number }>([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return result?.total ?? 0;
}

async function sumAdRevenue({ start, end }: DateRange) {
  const [result] = await AdCampaignModel.aggregate<{ total: number }>([
    {
      $match: {
        status: { $in: ['approved', 'active', 'paused', 'completed'] },
        updatedAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$metrics.spendUsd' } } },
  ]);

  return result?.total ?? 0;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

async function getUserGrowth(now: Date) {
  const start = startOfDay(addDays(now, -29));
  const rows = await UserModel.aggregate<{ _id: string; users: number }>([
    {
      $match: {
        role: { $in: [UserRole.USER, UserRole.CREATOR] },
        createdAt: { $gte: start, $lt: now },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        users: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const byDay = new Map(rows.map((row) => [row._id, row.users]));

  return Array.from({ length: 30 }, (_, index) => {
    const day = addDays(start, index);
    return { day: String(index + 1), users: byDay.get(formatDateKey(day)) ?? 0 };
  });
}

async function getRevenueTrend(now: Date) {
  const months = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth() - 6 + index, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end };
  });
  const totals = await Promise.all(months.map((range) => getRevenueForRange(range)));

  return months.map((range, index) => ({
    month: range.start.toLocaleString('en-US', { month: 'short' }),
    revenue: roundMoney(totals[index] ?? 0),
  }));
}

async function getActiveUsers(now: Date) {
  const start = new Date(now);
  start.setHours(start.getHours() - 23, 0, 0, 0);
  const rows = await SessionModel.aggregate<{ _id: number; userIds: unknown[] }>([
    {
      $match: {
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
        lastUsedAt: { $gte: start, $lt: now },
      },
    },
    {
      $group: {
        _id: { $hour: '$lastUsedAt' },
        userIds: { $addToSet: '$userId' },
      },
    },
  ]);
  const byHour = new Map(rows.map((row) => [row._id, row.userIds.length]));

  return Array.from({ length: 24 }, (_, index) => {
    const hourDate = new Date(start);
    hourDate.setHours(start.getHours() + index);
    const hour = hourDate.getHours();
    return { hour: `${hour}:00`, active: byHour.get(hour) ?? 0 };
  });
}

async function getRecentActivity(now: Date) {
  const [users, applications, notifications] = await Promise.all([
    UserModel.find({ role: { $in: [UserRole.USER, UserRole.CREATOR] } })
      .sort({ createdAt: -1 })
      .limit(4)
      .select('_id email profile.username profile.displayName createdAt')
      .lean()
      .exec(),
    CreatorApplicationModel.find()
      .sort({ createdAt: -1 })
      .limit(4)
      .select('_id fullName status createdAt')
      .lean()
      .exec(),
    NotificationModel.find({ type: 'system' })
      .sort({ createdAt: -1 })
      .limit(4)
      .select('_id title body createdAt')
      .lean()
      .exec(),
  ]);

  return [
    ...users.map((user) => ({
      id: user._id.toString(),
      type: 'signup' as const,
      text: `New user ${displayNameOf(user)} signed up`,
      time: timeAgo(user.createdAt, now),
      createdAt: user.createdAt,
    })),
    ...applications.map((application) => ({
      id: application._id.toString(),
      type: 'approval' as const,
      text: `Creator application from ${application.fullName} is ${application.status}`,
      time: timeAgo(application.createdAt, now),
      createdAt: application.createdAt,
    })),
    ...notifications.map((notification) => ({
      id: notification._id.toString(),
      type: 'flag' as const,
      text: notification.title || notification.body || 'System notification created',
      time: timeAgo(notification.createdAt, now),
      createdAt: notification.createdAt,
    })),
  ]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 8)
    .map(({ createdAt: _createdAt, ...activity }) => activity);
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayNameOf(user: any) {
  return user?.profile?.displayName || user?.profile?.username || user?.email || 'User';
}

function timeAgo(date: Date, now: Date) {
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export const adminService = new AdminService();
