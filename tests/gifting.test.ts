import { describe, expect, it, vi, beforeEach } from 'vitest';
import { coinRepository } from '../src/modules/coins/coin.repository.js';
import { coinService } from '../src/modules/coins/coin.service.js';
import { ReelModel } from '../src/modules/reels/reel.model.js';
import mongoose from 'mongoose';

describe('Gifting System - Unit & Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gift Catalog', () => {
    it('seeds and returns default gift items matching UI', async () => {
      vi.spyOn(coinRepository, 'getActiveGifts').mockResolvedValueOnce([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Rose',
          code: 'rose',
          icon: 'rose',
          coinPrice: 10,
          sortOrder: 1,
        } as any,
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Rocket',
          code: 'rocket',
          icon: 'rocket',
          coinPrice: 20,
          sortOrder: 2,
        } as any,
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Love',
          code: 'love',
          icon: 'love',
          coinPrice: 50,
          sortOrder: 3,
        } as any,
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Gem',
          code: 'gem',
          icon: 'gem',
          coinPrice: 100,
          sortOrder: 4,
        } as any,
      ]);

      const gifts = await coinService.getGiftCatalog();
      expect(gifts.length).toBe(4);
      expect(gifts[0]).toMatchObject({ name: 'Rose', coinPrice: 10 });
      expect(gifts[1]).toMatchObject({ name: 'Rocket', coinPrice: 20 });
      expect(gifts[2]).toMatchObject({ name: 'Love', coinPrice: 50 });
      expect(gifts[3]).toMatchObject({ name: 'Gem', coinPrice: 100 });
    });
  });

  describe('Sending Gifts & Coin Spending', () => {
    it('successfully sends a gift to a video/reel when user has enough coins', async () => {
      const senderId = new mongoose.Types.ObjectId().toString();
      const recipientId = new mongoose.Types.ObjectId().toString();
      const reelId = new mongoose.Types.ObjectId().toString();
      const giftId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'getGiftById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(giftId),
        name: 'Rocket',
        coinPrice: 20,
        isActive: true,
      } as any);

      vi.spyOn(ReelModel, 'findById').mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          exec: vi.fn().mockResolvedValueOnce({
            _id: new mongoose.Types.ObjectId(reelId),
            ownerId: new mongoose.Types.ObjectId(recipientId),
            status: 'PUBLISHED',
          }),
        }),
      } as any);

      vi.spyOn(coinRepository, 'getUserBalance')
        .mockResolvedValueOnce(500) // Initial check
        .mockResolvedValueOnce(480); // Remaining balance after deducting 20 coins

      vi.spyOn(coinRepository, 'sendGiftAndDeductCoins').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        senderId: new mongoose.Types.ObjectId(senderId),
        recipientId: new mongoose.Types.ObjectId(recipientId),
        targetType: 'reel',
        targetId: new mongoose.Types.ObjectId(reelId),
        giftId: new mongoose.Types.ObjectId(giftId),
        giftName: 'Rocket',
        coinPrice: 20,
        quantity: 1,
        totalCoins: 20,
        createdAt: new Date(),
      } as any);

      const result = await coinService.sendGift(senderId, {
        targetType: 'reel',
        targetId: reelId,
        giftId,
        quantity: 1,
      });

      expect(result).toMatchObject({
        giftSent: true,
        remainingCoinBalance: 480,
        gift: {
          name: 'Rocket',
          coinPrice: 20,
          quantity: 1,
          totalCoins: 20,
        },
      });

      expect(coinRepository.sendGiftAndDeductCoins).toHaveBeenCalledWith({
        senderId,
        recipientId,
        targetType: 'reel',
        targetId: reelId,
        giftId,
        giftName: 'Rocket',
        coinPrice: 20,
        quantity: 1,
        totalCoins: 20,
      });
    });

    it('rejects sending a gift when user has insufficient coins', async () => {
      const senderId = new mongoose.Types.ObjectId().toString();
      const recipientId = new mongoose.Types.ObjectId().toString();
      const reelId = new mongoose.Types.ObjectId().toString();
      const giftId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'getGiftById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(giftId),
        name: 'Gem',
        coinPrice: 100,
        isActive: true,
      } as any);

      vi.spyOn(ReelModel, 'findById').mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          exec: vi.fn().mockResolvedValueOnce({
            _id: new mongoose.Types.ObjectId(reelId),
            ownerId: new mongoose.Types.ObjectId(recipientId),
            status: 'PUBLISHED',
          }),
        }),
      } as any);

      vi.spyOn(coinRepository, 'getUserBalance').mockResolvedValueOnce(50); // Has 50, needs 100

      await expect(
        coinService.sendGift(senderId, {
          targetType: 'reel',
          targetId: reelId,
          giftId,
          quantity: 1,
        }),
      ).rejects.toThrow('Insufficient coin balance');
    });

    it('prevents user from sending a gift to their own post/reel', async () => {
      const sameUserId = new mongoose.Types.ObjectId().toString();
      const reelId = new mongoose.Types.ObjectId().toString();
      const giftId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(coinRepository, 'getGiftById').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(giftId),
        name: 'Rose',
        coinPrice: 10,
        isActive: true,
      } as any);

      vi.spyOn(ReelModel, 'findById').mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          exec: vi.fn().mockResolvedValueOnce({
            _id: new mongoose.Types.ObjectId(reelId),
            ownerId: new mongoose.Types.ObjectId(sameUserId),
          }),
        }),
      } as any);

      await expect(
        coinService.sendGift(sameUserId, {
          targetType: 'reel',
          targetId: reelId,
          giftId,
          quantity: 1,
        }),
      ).rejects.toThrow('You cannot send a gift to your own post or stream.');
    });
  });
});
