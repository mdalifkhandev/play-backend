import { Router } from 'express';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { requirePlatformFeature } from '../platform-settings/platform-feature.middleware.js';
import { coinController } from './coin.controller.js';
import {
  adminCoinPackageParamsSchema,
  adminGiftParamsSchema,
  approveWithdrawalSchema,
  completeWithdrawalSchema,
  convertDiamondsSchema,
  createAdminCoinPackageSchema,
  createAdminGiftSchema,
  createPaymentIntentSchema,
  getGiftsQuerySchema,
  getTransactionsQuerySchema,
  getWithdrawalsQuerySchema,
  rejectWithdrawalSchema,
  retryWithdrawalSchema,
  sendGiftSchema,
  stripeConnectLinkSchema,
  updateAdminCoinPackageSchema,
  updateAdminGiftSchema,
  updateCoinSettingsSchema,
  verifyPaymentSchema,
} from './coin.validation.js';

export const coinRouter: Router = Router();

// Public routes
coinRouter.get('/packages', coinController.getPackages);
coinRouter.get('/gifts', coinController.getGifts);
coinRouter.get('/gifts/targets/:targetType/:targetId', coinController.getTargetGiftSummary);

// Stripe Webhook Endpoint
coinRouter.post('/stripe/webhook', coinController.handleWebhook);

// Protected user coin & balance routes
coinRouter.get('/balance', authenticate, coinController.getBalance);
coinRouter.get('/diamonds', authenticate, coinController.getDiamondBalance);
coinRouter.post(
  '/diamonds/convert',
  authenticate,
  validateRequest(convertDiamondsSchema),
  coinController.convertDiamonds,
);
coinRouter.post(
  '/purchase/create-payment-intent',
  authenticate,
  requirePlatformFeature('coinPurchase'),
  validateRequest(createPaymentIntentSchema),
  coinController.createPaymentIntent,
);
coinRouter.post(
  '/purchase/verify-payment',
  authenticate,
  requirePlatformFeature('coinPurchase'),
  validateRequest(verifyPaymentSchema),
  coinController.verifyPayment,
);
coinRouter.get(
  '/history',
  authenticate,
  validateRequest(getTransactionsQuerySchema),
  coinController.getHistory,
);

// Protected gift routes
coinRouter.post(
  '/gifts/send',
  authenticate,
  validateRequest(sendGiftSchema),
  coinController.sendGift,
);
coinRouter.get(
  '/gifts/sent',
  authenticate,
  validateRequest(getGiftsQuerySchema),
  coinController.getSentGifts,
);
coinRouter.get(
  '/gifts/received',
  authenticate,
  validateRequest(getGiftsQuerySchema),
  coinController.getReceivedGifts,
);

// Protected creator payout & Stripe Connect routes
coinRouter.post(
  '/payouts/stripe-connect/account-link',
  authenticate,
  requirePlatformFeature('withdrawals'),
  validateRequest(stripeConnectLinkSchema),
  coinController.createStripeConnectLink,
);
coinRouter.get(
  '/payouts/stripe-connect/status',
  authenticate,
  requirePlatformFeature('withdrawals'),
  coinController.checkStripeConnectStatus,
);
coinRouter.get(
  '/withdraw/settings',
  authenticate,
  requirePlatformFeature('withdrawals'),
  coinController.getWithdrawalSettings,
);
coinRouter.post(
  '/withdraw/earnings',
  authenticate,
  requirePlatformFeature('withdrawals'),
  coinController.requestEarningWithdrawal,
);
coinRouter.get(
  '/withdraw/history',
  authenticate,
  requirePlatformFeature('withdrawals'),
  validateRequest(getTransactionsQuerySchema),
  coinController.getUserWithdrawals,
);

// Admin routes
coinRouter.use('/admin', authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.FINANCE));

coinRouter.get(
  '/admin/packages',
  coinController.getAdminPackages,
);
coinRouter.post(
  '/admin/packages',
  validateRequest(createAdminCoinPackageSchema),
  coinController.createAdminPackage,
);
coinRouter.patch(
  '/admin/packages/:packageId',
  validateRequest(updateAdminCoinPackageSchema),
  coinController.updateAdminPackage,
);
coinRouter.delete(
  '/admin/packages/:packageId',
  validateRequest(adminCoinPackageParamsSchema),
  coinController.deleteAdminPackage,
);
coinRouter.get(
  '/admin/gifts',
  coinController.getAdminGifts,
);
coinRouter.post(
  '/admin/gifts',
  validateRequest(createAdminGiftSchema),
  coinController.createAdminGift,
);
coinRouter.patch(
  '/admin/gifts/:giftId',
  validateRequest(updateAdminGiftSchema),
  coinController.updateAdminGift,
);
coinRouter.delete(
  '/admin/gifts/:giftId',
  validateRequest(adminGiftParamsSchema),
  coinController.deleteAdminGift,
);
coinRouter.get(
  '/admin/settings',
  coinController.getAdminSettings,
);
coinRouter.get(
  '/admin/transactions',
  validateRequest(getTransactionsQuerySchema),
  coinController.getAdminTransactions,
);
coinRouter.get(
  '/admin/withdrawals',
  validateRequest(getWithdrawalsQuerySchema),
  coinController.getAdminWithdrawals,
);
coinRouter.post(
  '/admin/withdrawals/:requestId/approve',
  validateRequest(approveWithdrawalSchema),
  coinController.approveWithdrawal,
);
coinRouter.post(
  '/admin/withdrawals/:requestId/reject',
  validateRequest(rejectWithdrawalSchema),
  coinController.rejectWithdrawal,
);
coinRouter.post(
  '/admin/withdrawals/:requestId/retry',
  validateRequest(retryWithdrawalSchema),
  coinController.retryWithdrawal,
);
coinRouter.post(
  '/admin/withdrawals/:requestId/complete',
  validateRequest(completeWithdrawalSchema),
  coinController.completeWithdrawal,
);
coinRouter.put(
  '/admin/settings',
  validateRequest(updateCoinSettingsSchema),
  coinController.updateCoinSettings,
);
