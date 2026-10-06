import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.route.js';
import {
  contentPageAdminRouter,
  contentPageRouter,
} from '../modules/content-pages/content-page.route.js';
import { legalConsentRouter } from '../modules/legal-consents/legal-consent.route.js';
import { mediaAssetRouter } from '../modules/media-assets/media-asset.route.js';
import { mediaRouter } from '../modules/media-assets/media.route.js';
import { musicRouter } from '../modules/music/music.route.js';
import { reelRouter } from '../modules/reels/reel.route.js';
import {
  commentRouter,
  engagementRouter,
  savedRouter,
} from '../modules/engagement/engagement.routes.js';
import { storyRouter } from '../modules/stories/story.route.js';
import { liveStreamAdminRouter, liveStreamRouter } from '../modules/live-streams/live-stream.route.js';
import { conversationRouter } from '../modules/conversations/conversation.route.js';
import {
  supportRequestAdminRouter,
  supportRequestRouter,
} from '../modules/support-requests/support-request.route.js';
import { coinRouter } from '../modules/coins/coin.route.js';
import { healthRouter } from './health.route.js';
import { userAdminRouter, userRouter } from '../modules/users/user.route.js';
import { notificationRouter } from '../modules/notifications/notification.route.js';
import { kidsModeAdminRouter, kidsModeRouter } from '../modules/kids-mode/kids-mode.route.js';
import { activityRouter } from '../modules/activities/activity.route.js';
import { rewardAdminRouter, rewardRouter } from '../modules/rewards/reward.route.js';
import { subscriptionRouter } from '../modules/subscriptions/subscription.route.js';
import { adAdminRouter, adRouter } from '../modules/ads/ad.route.js';
import { creatorAdminRouter, creatorRouter } from '../modules/creators/creator.route.js';
import { moderationAdminRouter, moderationRouter } from '../modules/moderation/moderation.route.js';
import { monetizationAdminRouter } from '../modules/monetization/monetization.route.js';
import { creatorCategoryRouter } from '../modules/creator-categories/creator-category.route.js';
import { occupationRouter } from '../modules/occupations/occupation.route.js';
import { adminSearchRouter } from '../modules/admin-search/admin-search.route.js';
import { adminAuditRouter } from '../modules/admin-audit/admin-audit.route.js';
import { announcementAdminRouter, announcementRouter } from '../modules/announcements/announcement.route.js';
import {
  platformSettingAdminRouter,
  platformSettingRouter,
} from '../modules/platform-settings/platform-setting.route.js';
import { adminDashboardRouter } from '../modules/admin/admin.route.js';
import { adminContentRouter } from '../modules/admin-content/admin-content.route.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/announcements', announcementRouter);
apiRouter.use('/settings', platformSettingRouter);
apiRouter.use('/activities', activityRouter);
apiRouter.use('/rewards', rewardRouter);
apiRouter.use('/subscriptions', subscriptionRouter);
apiRouter.use('/creators', creatorRouter);
apiRouter.use('/creator-categories', creatorCategoryRouter);
apiRouter.use('/occupations', occupationRouter);
apiRouter.use('/kids-mode', kidsModeRouter);
apiRouter.use('/coins', coinRouter);
apiRouter.use('/ads', adRouter);
apiRouter.use('/reports', moderationRouter);
apiRouter.use('/content-pages', contentPageRouter);
apiRouter.use('/legal-consents', legalConsentRouter);
apiRouter.use('/uploads', mediaAssetRouter);
apiRouter.use('/media', mediaRouter);
apiRouter.use('/music', musicRouter);
apiRouter.use('/reels', reelRouter);
apiRouter.use('/live-streams', liveStreamRouter);
apiRouter.use('/conversations', conversationRouter);
apiRouter.use('/engagements', engagementRouter);
apiRouter.use('/comments', commentRouter);
apiRouter.use('/me', savedRouter);
apiRouter.use('/stories', storyRouter);
apiRouter.use('/support-requests', supportRequestRouter);
apiRouter.use('/admin/content-pages', contentPageAdminRouter);
apiRouter.use('/admin/support-requests', supportRequestAdminRouter);
apiRouter.use('/admin/ads', adAdminRouter);
apiRouter.use('/admin/creators', creatorAdminRouter);
apiRouter.use('/admin/users', userAdminRouter);
apiRouter.use('/admin/moderation', moderationAdminRouter);
apiRouter.use('/admin/monetization', monetizationAdminRouter);
apiRouter.use('/admin/rewards', rewardAdminRouter);
apiRouter.use('/admin/live-streams', liveStreamAdminRouter);
apiRouter.use('/admin/kids-mode', kidsModeAdminRouter);
apiRouter.use('/admin/search', adminSearchRouter);
apiRouter.use('/admin/audit-logs', adminAuditRouter);
apiRouter.use('/admin/announcements', announcementAdminRouter);
apiRouter.use('/admin/settings', platformSettingAdminRouter);
apiRouter.use('/admin/dashboard', adminDashboardRouter);
apiRouter.use('/admin/content', adminContentRouter);

