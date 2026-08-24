import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { coinController } from './coin.controller.js';
import {
  approveWithdrawalSchema,
  convertDiamondsSchema,
  createPaymentIntentSchema,
  getGiftsQuerySchema,
  getTransactionsQuerySchema,
  getWithdrawalsQuerySchema,
  rejectWithdrawalSchema,
  sendGiftSchema,
  stripeConnectLinkSchema,
  updateCoinSettingsSchema,
  verifyPaymentSchema,
  withdrawCoinsSchema,
} from './coin.validation.js';

export const coinRouter = Router();

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
  validateRequest(createPaymentIntentSchema),
  coinController.createPaymentIntent,
);
coinRouter.post(
  '/purchase/verify-payment',
  authenticate,
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
  validateRequest(stripeConnectLinkSchema),
  coinController.createStripeConnectLink,
);
coinRouter.get(
  '/payouts/stripe-connect/status',
  authenticate,
  coinController.checkStripeConnectStatus,
);
coinRouter.get(
  '/withdraw/settings',
  authenticate,
  coinController.getWithdrawalSettings,
);
coinRouter.post(
  '/withdraw',
  authenticate,
  validateRequest(withdrawCoinsSchema),
  coinController.requestWithdrawal,
);
coinRouter.get(
  '/withdraw/history',
  authenticate,
  validateRequest(getTransactionsQuerySchema),
  coinController.getUserWithdrawals,
);

// Admin routes
coinRouter.get(
  '/admin/withdrawals',
  authenticate,
  validateRequest(getWithdrawalsQuerySchema),
  coinController.getAdminWithdrawals,
);
coinRouter.post(
  '/admin/withdrawals/:requestId/approve',
  authenticate,
  validateRequest(approveWithdrawalSchema),
  coinController.approveWithdrawal,
);
coinRouter.post(
  '/admin/withdrawals/:requestId/reject',
  authenticate,
  validateRequest(rejectWithdrawalSchema),
  coinController.rejectWithdrawal,
);
coinRouter.put(
  '/admin/settings',
  authenticate,
  validateRequest(updateCoinSettingsSchema),
  coinController.updateCoinSettings,
);
