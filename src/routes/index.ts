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
import { liveStreamRouter } from '../modules/live-streams/live-stream.route.js';
import { conversationRouter } from '../modules/conversations/conversation.route.js';
import {
  supportRequestAdminRouter,
  supportRequestRouter,
} from '../modules/support-requests/support-request.route.js';
import { coinRouter } from '../modules/coins/coin.route.js';
import { healthRouter } from './health.route.js';
import { userRouter } from '../modules/users/user.route.js';
import { notificationRouter } from '../modules/notifications/notification.route.js';
import { kidsModeRouter } from '../modules/kids-mode/kids-mode.route.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/kids-mode', kidsModeRouter);
apiRouter.use('/coins', coinRouter);
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

