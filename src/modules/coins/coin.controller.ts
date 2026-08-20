import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { coinService } from './coin.service.js';
import type {
  ApproveWithdrawalInput,
  ConvertDiamondsInput,
  CreatePaymentIntentInput,
  CreateSquarePaymentInput,
  GetGiftsQueryInput,
  GetTransactionsQueryInput,
  GetWithdrawalsQueryInput,
  RejectWithdrawalInput,
  SendGiftInput,
  StripeConnectLinkInput,
  UpdateCoinSettingsInput,
  VerifyPaymentInput,
  WithdrawCoinsInput,
} from './coin.validation.js';
import type { GiftTargetType } from './sent-gift.model.js';
import type { WithdrawalStatus } from './withdrawal-request.model.js';

export class CoinController {
  getPackages = asyncHandler(async (_request: Request, response: Response) => {
    const packages = await coinService.getPackages();
    return sendSuccess(response, 200, 'Coin packages retrieved successfully.', packages);
  });

  getBalance = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const balance = await coinService.getUserCoinBalance(userId);
    return sendSuccess(response, 200, 'Coin balance retrieved successfully.', balance);
  });

  getDiamondBalance = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const balance = await coinService.getUserDiamondBalance(userId);
    return sendSuccess(response, 200, 'Diamond balance retrieved successfully.', balance);
  });

  convertDiamonds = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const input = request.body as ConvertDiamondsInput;
    const result = await coinService.convertDiamonds(userId, input);
    return sendSuccess(response, 200, 'Diamonds converted successfully.', result);
  });

  createPaymentIntent = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { packageId } = request.body as CreatePaymentIntentInput;
    const result = await coinService.createPaymentIntent(userId, packageId);
    return sendSuccess(response, 201, 'Payment intent created successfully.', result);
  });

  verifyPayment = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { paymentIntentId } = request.body as VerifyPaymentInput;
    const result = await coinService.verifyPaymentIntent(userId, paymentIntentId);
    return sendSuccess(response, 200, 'Payment status verified successfully.', result);
  });

  createSquarePayment = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { packageId, sourceId } = request.body as CreateSquarePaymentInput;
    const result = await coinService.createSquarePayment(userId, packageId, sourceId);
    return sendSuccess(response, 201, 'Square payment completed successfully.', result);
  });

  handleWebhook = asyncHandler(async (request: Request, response: Response) => {
    const signature = request.header('stripe-signature');
    const rawBody = (request as unknown as { rawBody?: Buffer | string }).rawBody ?? request.body;
    const result = await coinService.handleStripeWebhook(rawBody, signature);
    return response.status(200).json(result);
  });

  getHistory = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { page, limit } = request.query as unknown as GetTransactionsQueryInput;
    const result = await coinService.getTransactionHistory(userId, page, limit);
    return sendSuccess(response, 200, 'Transaction history retrieved successfully.', result);
  });

  getGifts = asyncHandler(async (_request: Request, response: Response) => {
    const gifts = await coinService.getGiftCatalog();
    return sendSuccess(response, 200, 'Gift catalog retrieved successfully.', gifts);
  });

  sendGift = asyncHandler(async (request: Request, response: Response) => {
    const senderId = request.user!.userId;
    const input = request.body as SendGiftInput;
    const result = await coinService.sendGift(senderId, input);
    return sendSuccess(response, 200, 'Gift sent successfully!', result);
  });

  getSentGifts = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { page, limit } = request.query as unknown as GetGiftsQueryInput;
    const result = await coinService.getUserSentGifts(userId, page, limit);
    return sendSuccess(response, 200, 'Sent gifts retrieved successfully.', result);
  });

  getReceivedGifts = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { page, limit } = request.query as unknown as GetGiftsQueryInput;
    const result = await coinService.getUserReceivedGifts(userId, page, limit);
    return sendSuccess(response, 200, 'Received gifts retrieved successfully.', result);
  });

  getTargetGiftSummary = asyncHandler(async (request: Request, response: Response) => {
    const { targetType, targetId } = request.params as { targetType: string; targetId: string };
    const result = await coinService.getTargetGiftSummary(targetType as GiftTargetType, targetId);
    return sendSuccess(response, 200, 'Target gift summary retrieved successfully.', result);
  });

  // --- PAYOUT & WITHDRAWAL HANDLERS ---

  createStripeConnectLink = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { returnUrl, refreshUrl } = request.body as StripeConnectLinkInput;
    const result = await coinService.createStripeConnectAccountLink(userId, returnUrl, refreshUrl);
    return sendSuccess(response, 200, 'Stripe Connect onboarding link created.', result);
  });

  checkStripeConnectStatus = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await coinService.checkStripeConnectStatus(userId);
    return sendSuccess(response, 200, 'Stripe Connect account status retrieved.', result);
  });

  getWithdrawalSettings = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await coinService.getWithdrawalSettings(userId);
    return sendSuccess(response, 200, 'Withdrawal settings retrieved successfully.', result);
  });

  requestWithdrawal = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { coins } = request.body as WithdrawCoinsInput;
    const result = await coinService.requestWithdrawal(userId, coins);
    return sendSuccess(response, 201, 'Withdrawal request submitted successfully.', result);
  });

  getUserWithdrawals = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { page, limit } = request.query as unknown as GetTransactionsQueryInput;
    const result = await coinService.getUserWithdrawalHistory(userId, page, limit);
    return sendSuccess(response, 200, 'Withdrawal history retrieved successfully.', result);
  });

  // --- ADMIN HANDLERS ---

  approveWithdrawal = asyncHandler(async (request: Request, response: Response) => {
    const adminUserId = request.user!.userId;
    const { requestId } = request.params as { requestId: string };
    const { adminNotes } = request.body as ApproveWithdrawalInput;
    const result = await coinService.approveWithdrawal(adminUserId, requestId, adminNotes);
    return sendSuccess(response, 200, 'Withdrawal approved and funds transferred.', result);
  });

  rejectWithdrawal = asyncHandler(async (request: Request, response: Response) => {
    const adminUserId = request.user!.userId;
    const { requestId } = request.params as { requestId: string };
    const { reason } = request.body as RejectWithdrawalInput;
    const result = await coinService.rejectWithdrawal(adminUserId, requestId, reason);
    return sendSuccess(response, 200, 'Withdrawal rejected and coins refunded.', result);
  });

  getAdminWithdrawals = asyncHandler(async (request: Request, response: Response) => {
    const { page, limit, status } = request.query as unknown as GetWithdrawalsQueryInput;
    const result = await coinService.getAdminWithdrawalRequests(status as WithdrawalStatus | 'all', page, limit);
    return sendSuccess(response, 200, 'Admin withdrawal requests retrieved.', result);
  });

  updateCoinSettings = asyncHandler(async (request: Request, response: Response) => {
    const adminUserId = request.user!.userId;
    const input = request.body as UpdateCoinSettingsInput;
    const result = await coinService.updateAdminCoinSettings(adminUserId, input);
    return sendSuccess(response, 200, 'Coin conversion settings updated.', result);
  });
}

export const coinController = new CoinController();
