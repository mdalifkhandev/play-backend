import { z } from 'zod';

export const createPaymentIntentSchema = {
  body: z.object({
    packageId: z.string().trim().min(1, 'Package ID is required.'),
  }),
};

export const verifyPaymentSchema = {
  body: z.object({
    paymentIntentId: z.string().trim().min(1, 'Payment Intent ID is required.'),
  }),
};


export const getTransactionsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

export const sendGiftSchema = {
  body: z.object({
    targetType: z.enum(['reel', 'live-stream', 'story'], {
      message: 'Target type must be reel, live-stream, or story.',
    }),
    targetId: z.string().trim().min(1, 'Target ID is required.'),
    giftId: z.string().trim().min(1, 'Gift ID is required.'),
    quantity: z.coerce.number().int().positive().default(1),
  }),
};

export const getGiftsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

export const stripeConnectLinkSchema = {
  body: z.object({
    returnUrl: z.string().trim().optional(),
    refreshUrl: z.string().trim().optional(),
  }),
};

export const withdrawCoinsSchema = {
  body: z.object({
    coins: z.coerce.number().int().positive('Coins must be a positive integer.'),
  }),
};

export const convertDiamondsSchema = {
  body: z.object({
    diamonds: z.coerce.number().int().positive('Diamonds must be a positive integer.'),
  }),
};

export const approveWithdrawalSchema = {
  params: z.object({
    requestId: z.string().trim().min(1, 'Request ID is required.'),
  }),
  body: z.object({
    adminNotes: z.string().trim().max(500).optional(),
  }),
};

export const rejectWithdrawalSchema = {
  params: z.object({
    requestId: z.string().trim().min(1, 'Request ID is required.'),
  }),
  body: z.object({
    reason: z.string().trim().min(1, 'Rejection reason is required.').max(500),
  }),
};

export const updateCoinSettingsSchema = {
  body: z.object({
    coinsPerDollar: z.coerce.number().positive('Coins per dollar must be greater than 0.'),
    minWithdrawalCoins: z.coerce.number().positive().optional(),
    maxWithdrawalCoins: z.coerce.number().positive().optional(),
  }),
};

export const getWithdrawalsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['pending', 'approved', 'rejected', 'transferred', 'failed', 'all']).default('all'),
  }),
};

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema.body>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema.body>;
export type GetTransactionsQueryInput = z.infer<typeof getTransactionsQuerySchema.query>;
export type SendGiftInput = z.infer<typeof sendGiftSchema.body>;
export type GetGiftsQueryInput = z.infer<typeof getGiftsQuerySchema.query>;
export type StripeConnectLinkInput = z.infer<typeof stripeConnectLinkSchema.body>;
export type WithdrawCoinsInput = z.infer<typeof withdrawCoinsSchema.body>;
export type ConvertDiamondsInput = z.infer<typeof convertDiamondsSchema.body>;
export type ApproveWithdrawalInput = z.infer<typeof approveWithdrawalSchema.body>;
export type RejectWithdrawalInput = z.infer<typeof rejectWithdrawalSchema.body>;
export type UpdateCoinSettingsInput = z.infer<typeof updateCoinSettingsSchema.body>;
export type GetWithdrawalsQueryInput = z.infer<typeof getWithdrawalsQuerySchema.query>;
