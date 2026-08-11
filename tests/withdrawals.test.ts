import { describe, expect, it, vi, beforeEach } from 'vitest';
import { coinRepository } from '../src/modules/coins/coin.repository.js';
import { coinService } from '../src/modules/coins/coin.service.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { stripe } from '../src/config/stripe.config.js';
import mongoose from 'mongoose';

vi.mock('../src/config/stripe.config.js', () => ({
  stripe: {
    accounts: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    accountLinks: {
      create: vi.fn(),
    },
    transfers: {
      create: vi.fn(),
    },
  },
  getStripeInstance: vi.fn(),
}));

describe('Withdrawals & Stripe Connect Payouts System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Withdrawal Settings & USD Conversion Calculation', () => {
    it('calculates estimated USD value correctly (e.g. 24,500 coins = $245.00 USD at 100 coins/dollar)', async () => {
      const mockUserId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'getCoinSettings').mockResolvedValueOnce({
        coinsPerDollar: 100,
        minWithdrawalCoins: 1000,
        maxWithdrawalCoins: 500000,
      } as any);

      vi.spyOn(UserModel, 'findById').mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          exec: vi.fn().mockResolvedValueOnce({
            coinBalance: 24500,
            stripeConnectAccountId: 'acct_test_123',
            stripeConnectOnboardingComplete: true,
          }),
        }),
      } as any);

      const settings = await coinService.getWithdrawalSettings(mockUserId);

      expect(settings).toMatchObject({
        coinsPerDollar: 100,
        userCoinBalance: 24500,
        estimatedUsdValue: 245.0,
        stripeConnectAccountId: 'acct_test_123',
        stripeConnectOnboardingComplete: true,
      });
    });
  });

  describe('Stripe Connect Onboarding', () => {
    it('creates an Express Connect account and onboarding link for a creator', async () => {
      const mockUserId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(UserModel, 'findById').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce({
          _id: new mongoose.Types.ObjectId(mockUserId),
          email: 'creator@example.com',
          stripeConnectAccountId: undefined,
        }),
      } as any);

      vi.spyOn(stripe.accounts, 'create').mockResolvedValueOnce({
        id: 'acct_express_new123',
      } as any);

      vi.spyOn(coinRepository, 'updateUserStripeConnectAccount').mockResolvedValueOnce({} as any);

      vi.spyOn(stripe.accountLinks, 'create').mockResolvedValueOnce({
        url: 'https://connect.stripe.com/express/onboarding/test_link_123',
      } as any);

      const res = await coinService.createStripeConnectAccountLink(mockUserId);

      expect(res).toEqual({
        url: 'https://connect.stripe.com/express/onboarding/test_link_123',
        stripeConnectAccountId: 'acct_express_new123',
      });

      expect(stripe.accounts.create).toHaveBeenCalledWith({
        type: 'express',
        email: 'creator@example.com',
        capabilities: { transfers: { requested: true } },
        metadata: { userId: mockUserId },
      });
    });
  });

  describe('Withdrawal Request Submission', () => {
    it('rejects withdrawal request if user has not completed payout account setup', async () => {
      const mockUserId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(UserModel, 'findById').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce({
          _id: new mongoose.Types.ObjectId(mockUserId),
          coinBalance: 5000,
          stripeConnectOnboardingComplete: false,
        }),
      } as any);

      await expect(coinService.requestWithdrawal(mockUserId, 2000)).rejects.toThrow(
        'Please setup your payout account before requesting a withdrawal.',
      );
    });

    it('submits withdrawal request, holds coins, and logs pending request', async () => {
      const mockUserId = new mongoose.Types.ObjectId().toString();
      const requestId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(UserModel, 'findById').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce({
          _id: new mongoose.Types.ObjectId(mockUserId),
          coinBalance: 24500,
          stripeConnectAccountId: 'acct_test_123',
          stripeConnectOnboardingComplete: true,
        }),
      } as any);

      vi.spyOn(coinRepository, 'getCoinSettings').mockResolvedValueOnce({
        coinsPerDollar: 100,
        minWithdrawalCoins: 1000,
        maxWithdrawalCoins: 500000,
      } as any);

      vi.spyOn(coinRepository, 'createWithdrawalRequestAndHoldCoins').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(requestId),
        userId: new mongoose.Types.ObjectId(mockUserId),
        stripeConnectAccountId: 'acct_test_123',
        coins: 10000,
        coinsPerDollar: 100,
        amountUsd: 100.0,
        status: 'pending',
        createdAt: new Date(),
      } as any);

      vi.spyOn(coinRepository, 'getUserBalance').mockResolvedValueOnce(14500);

      const res = await coinService.requestWithdrawal(mockUserId, 10000);

      expect(res).toMatchObject({
        withdrawalId: requestId,
        coins: 10000,
        coinsPerDollar: 100,
        amountUsd: 100.0,
        status: 'pending',
        remainingCoinBalance: 14500,
      });
    });
  });

  describe('Admin Approval & Automatic Bank Transfer', () => {
    it('executes Stripe transfer to creator bank account upon admin approval', async () => {
      const adminUserId = new mongoose.Types.ObjectId().toString();
      const requestId = new mongoose.Types.ObjectId().toString();
      const creatorUserId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'findWithdrawalRequestById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(requestId),
        userId: new mongoose.Types.ObjectId(creatorUserId),
        stripeConnectAccountId: 'acct_express_dest_456',
        coins: 24500,
        coinsPerDollar: 100,
        amountUsd: 245.0,
        status: 'pending',
      } as any);

      vi.spyOn(stripe.transfers, 'create').mockResolvedValueOnce({
        id: 'tr_test_stripe_transfer_789',
        amount: 24500,
        currency: 'usd',
      } as any);

      vi.spyOn(coinRepository, 'approveAndMarkTransferred').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(requestId),
        status: 'transferred',
      } as any);

      const result = await coinService.approveWithdrawal(adminUserId, requestId, 'Approved by admin');

      expect(result).toMatchObject({
        approved: true,
        withdrawalId: requestId,
        stripeTransferId: 'tr_test_stripe_transfer_789',
        amountUsd: 245.0,
        coins: 24500,
        status: 'transferred',
      });

      expect(stripe.transfers.create).toHaveBeenCalledWith({
        amount: 24500, // $245.00 in cents
        currency: 'usd',
        destination: 'acct_express_dest_456',
        description: 'Payout for 24500 coins withdrawal',
        metadata: {
          withdrawalId: requestId,
          userId: creatorUserId,
        },
      });
    });

    it('refunds held coins back to user balance upon admin rejection', async () => {
      const adminUserId = new mongoose.Types.ObjectId().toString();
      const requestId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'findWithdrawalRequestById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(requestId),
        coins: 5000,
        status: 'pending',
      } as any);

      vi.spyOn(coinRepository, 'rejectAndRefundWithdrawal').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(requestId),
        status: 'rejected',
        adminNotes: 'Invalid documentation',
      } as any);

      const result = await coinService.rejectWithdrawal(adminUserId, requestId, 'Invalid documentation');

      expect(result).toMatchObject({
        rejected: true,
        withdrawalId: requestId,
        refundedCoins: 5000,
        status: 'rejected',
      });

      expect(coinRepository.rejectAndRefundWithdrawal).toHaveBeenCalledWith(
        requestId,
        adminUserId,
        'Invalid documentation',
      );
    });
  });

  describe('Admin Coin Conversion Settings', () => {
    it('allows admin to update the global coin conversion rate (e.g. 100 coins = $1.00 USD)', async () => {
      const adminUserId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'updateCoinSettings').mockResolvedValueOnce({
        coinsPerDollar: 100,
        minWithdrawalCoins: 500,
        maxWithdrawalCoins: 1000000,
        updatedAt: new Date(),
      } as any);

      const result = await coinService.updateAdminCoinSettings(adminUserId, {
        coinsPerDollar: 100,
        minWithdrawalCoins: 500,
      });

      expect(result).toMatchObject({
        coinsPerDollar: 100,
        minWithdrawalCoins: 500,
        maxWithdrawalCoins: 1000000,
      });
    });
  });
});
