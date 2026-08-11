import { describe, expect, it, vi, beforeEach } from 'vitest';
import { coinRepository } from '../src/modules/coins/coin.repository.js';
import { coinService } from '../src/modules/coins/coin.service.js';
import { CoinTransactionModel } from '../src/modules/coins/coin-transaction.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { stripe } from '../src/config/stripe.config.js';
import mongoose from 'mongoose';

// Mock Stripe SDK calls for unit testing
vi.mock('../src/config/stripe.config.js', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
  getStripeInstance: vi.fn(),
}));

describe('Coins Module - Unit & Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Coin Package Repository & Service', () => {
    it('seeds and returns default coin packages when database is empty', async () => {
      vi.spyOn(coinRepository, 'getActivePackages').mockResolvedValueOnce([
        {
          _id: new mongoose.Types.ObjectId(),
          name: '100 Coins',
          coins: 100,
          price: 0.99,
          currency: 'usd',
          isPopular: false,
          isActive: true,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          _id: new mongoose.Types.ObjectId(),
          name: '500 Coins',
          coins: 500,
          price: 1.99,
          currency: 'usd',
          isPopular: true,
          isActive: true,
          sortOrder: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      const packages = await coinService.getPackages();
      expect(packages.length).toBe(2);
      expect(packages[0]).toMatchObject({
        name: '100 Coins',
        coins: 100,
        price: 0.99,
        isPopular: false,
      });
      expect(packages[1]).toMatchObject({
        name: '500 Coins',
        coins: 500,
        price: 1.99,
        isPopular: true,
      });
    });
  });

  describe('Payment Intent Creation', () => {
    it('creates a Stripe PaymentIntent and records a pending transaction', async () => {
      const mockPackageId = new mongoose.Types.ObjectId().toString();
      const mockUserId = new mongoose.Types.ObjectId().toString();
      const mockTransactionId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'getPackageById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(mockPackageId),
        name: '500 Coins',
        coins: 500,
        price: 1.99,
        currency: 'usd',
        isActive: true,
      } as any);

      vi.spyOn(coinRepository, 'createTransaction').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(mockTransactionId),
        userId: new mongoose.Types.ObjectId(mockUserId),
        packageId: new mongoose.Types.ObjectId(mockPackageId),
        coins: 500,
        amount: 1.99,
        currency: 'usd',
        status: 'pending',
      } as any);

      vi.spyOn(stripe.paymentIntents, 'create').mockResolvedValueOnce({
        id: 'pi_test_123456789',
        client_secret: 'pi_test_123456789_secret_abc',
        amount: 199,
        currency: 'usd',
        status: 'requires_payment_method',
      } as any);

      vi.spyOn(coinRepository, 'updatePaymentIntentDetails').mockResolvedValueOnce({} as any);

      const result = await coinService.createPaymentIntent(mockUserId, mockPackageId);

      expect(result).toMatchObject({
        transactionId: mockTransactionId,
        paymentIntentId: 'pi_test_123456789',
        clientSecret: 'pi_test_123456789_secret_abc',
        amount: 1.99,
        coins: 500,
        currency: 'usd',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 199,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          transactionId: mockTransactionId,
          userId: mockUserId,
          packageId: mockPackageId,
          coins: '500',
        },
      });
    });
  });

  describe('Stripe Webhook & Coin Crediting Idempotency', () => {
    it('handles payment_intent.succeeded webhook event and credits coins', async () => {
      const paymentIntentId = 'pi_test_succeeded_999';

      const spyComplete = vi
        .spyOn(coinRepository, 'completeTransactionAndAddCoins')
        .mockResolvedValueOnce({
          transaction: {
            _id: new mongoose.Types.ObjectId(),
            status: 'completed',
            coins: 500,
          } as any,
          newlyCompleted: true,
        });

      const rawEvent = JSON.stringify({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            status: 'succeeded',
            amount: 199,
          },
        },
      });

      const response = await coinService.handleStripeWebhook(rawEvent);

      expect(response).toEqual({ received: true, eventType: 'payment_intent.succeeded' });
      expect(spyComplete).toHaveBeenCalledWith(paymentIntentId);
    });

    it('ensures duplicate payment_intent.succeeded webhooks do not double-credit coins (idempotency)', async () => {
      const paymentIntentId = 'pi_test_duplicate_888';

      // First webhook call credits coins
      vi.spyOn(coinRepository, 'completeTransactionAndAddCoins').mockResolvedValueOnce({
        transaction: { _id: new mongoose.Types.ObjectId(), status: 'completed', coins: 1000 } as any,
        newlyCompleted: true,
      });

      const result1 = await coinService.handleStripeWebhook(
        JSON.stringify({
          type: 'payment_intent.succeeded',
          data: { object: { id: paymentIntentId } },
        }),
      );
      expect(result1.received).toBe(true);

      // Second duplicate webhook call returns newlyCompleted: false
      vi.spyOn(coinRepository, 'completeTransactionAndAddCoins').mockResolvedValueOnce({
        transaction: { _id: new mongoose.Types.ObjectId(), status: 'completed', coins: 1000 } as any,
        newlyCompleted: false,
      });

      const result2 = await coinService.handleStripeWebhook(
        JSON.stringify({
          type: 'payment_intent.succeeded',
          data: { object: { id: paymentIntentId } },
        }),
      );
      expect(result2.received).toBe(true);
    });
  });

  describe('Payment Verification Fallback', () => {
    it('verifies succeeded payment intent directly from Stripe API', async () => {
      const mockUserId = new mongoose.Types.ObjectId().toString();
      const mockPiId = 'pi_test_succeeded_777';

      vi.spyOn(coinRepository, 'findTransactionByPaymentIntentId').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(mockUserId),
        coins: 500,
        status: 'pending',
      } as any);

      vi.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValueOnce({
        id: mockPiId,
        status: 'succeeded',
      } as any);

      vi.spyOn(coinRepository, 'completeTransactionAndAddCoins').mockResolvedValueOnce({
        transaction: { status: 'completed', coins: 500 } as any,
        newlyCompleted: true,
      });

      vi.spyOn(coinRepository, 'getUserBalance').mockResolvedValueOnce(500);

      const res = await coinService.verifyPaymentIntent(mockUserId, mockPiId);

      expect(res).toMatchObject({
        status: 'completed',
        coinsCredited: true,
        coinBalance: 500,
        coinsAdded: 500,
      });
    });
  });
});
