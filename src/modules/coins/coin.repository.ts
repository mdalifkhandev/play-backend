import { Types } from 'mongoose';
import { CoinPackageModel, type CoinPackageDocument } from './coin-package.model.js';
import { CoinTransactionModel, type CoinTransactionDocument } from './coin-transaction.model.js';
import { GiftCatalogModel, type GiftCatalogDocument } from './gift.model.js';
import { SentGiftModel, type SentGiftDocument, type GiftTargetType } from './sent-gift.model.js';
import { CoinSettingModel, type CoinSettingDocument } from './coin-setting.model.js';
import { WithdrawalRequestModel, type WithdrawalRequestDocument, type WithdrawalStatus } from './withdrawal-request.model.js';
import { UserModel } from '../users/user.model.js';
import { ReelModel } from '../reels/reel.model.js';
import { LiveStreamModel } from '../live-streams/live-stream.model.js';

export class CoinRepository {
  async getActivePackages(): Promise<CoinPackageDocument[]> {
    return CoinPackageModel.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).exec();
  }

  async getPackageById(packageId: string): Promise<CoinPackageDocument | null> {
    if (!Types.ObjectId.isValid(packageId)) {
      return null;
    }
    return CoinPackageModel.findById(packageId).exec();
  }

  async getAdminPackages(): Promise<CoinPackageDocument[]> {
    return CoinPackageModel.find().sort({ sortOrder: 1, price: 1, createdAt: -1 }).exec();
  }

  async createAdminPackage(data: {
    name: string;
    coins: number;
    price: number;
    currency: string;
    isPopular?: boolean;
    isActive?: boolean;
    sortOrder?: number;
    stripePriceId?: string | undefined;
  }): Promise<CoinPackageDocument> {
    const payload: Record<string, unknown> = {
      name: data.name,
      coins: data.coins,
      price: data.price,
      currency: data.currency.toLowerCase(),
    };
    if (data.isPopular !== undefined) payload.isPopular = data.isPopular;
    if (data.isActive !== undefined) payload.isActive = data.isActive;
    if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
    if (data.stripePriceId) payload.stripePriceId = data.stripePriceId;
    return CoinPackageModel.create({
      ...payload,
    });
  }

  async updateAdminPackage(
    packageId: string,
    data: Record<string, unknown>,
  ): Promise<CoinPackageDocument | null> {
    if (!Types.ObjectId.isValid(packageId)) {
      return null;
    }
    return CoinPackageModel.findByIdAndUpdate(
      packageId,
      {
        $set: {
          ...data,
          ...(typeof data.currency === 'string' ? { currency: data.currency.toLowerCase() } : {}),
        },
      },
      { new: true },
    ).exec();
  }

  async deleteAdminPackage(packageId: string): Promise<CoinPackageDocument | null> {
    if (!Types.ObjectId.isValid(packageId)) {
      return null;
    }
    return CoinPackageModel.findByIdAndDelete(packageId).exec();
  }

  async seedDefaultPackages(): Promise<void> {
    // Coin packages are managed from the admin dashboard and stored in DB.
    return;
  }

  async getActiveGifts(): Promise<GiftCatalogDocument[]> {
    let gifts = await GiftCatalogModel.find({ isActive: true }).sort({ sortOrder: 1, coinPrice: 1 }).exec();

    if (gifts.length === 0) {
      await this.seedDefaultGifts();
      gifts = await GiftCatalogModel.find({ isActive: true }).sort({ sortOrder: 1, coinPrice: 1 }).exec();
    }

    return gifts;
  }

  async getGiftById(giftId: string): Promise<GiftCatalogDocument | null> {
    if (!Types.ObjectId.isValid(giftId)) {
      return null;
    }
    return GiftCatalogModel.findById(giftId).exec();
  }

  async getAdminGifts(): Promise<GiftCatalogDocument[]> {
    return GiftCatalogModel.find().sort({ sortOrder: 1, coinPrice: 1, createdAt: -1 }).exec();
  }

  async createAdminGift(data: {
    name: string;
    code: string;
    icon: string;
    coinPrice: number;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<GiftCatalogDocument> {
    return GiftCatalogModel.create({
      ...data,
      code: data.code.toLowerCase(),
    });
  }

  async updateAdminGift(
    giftId: string,
    data: Record<string, unknown>,
  ): Promise<GiftCatalogDocument | null> {
    if (!Types.ObjectId.isValid(giftId)) {
      return null;
    }
    return GiftCatalogModel.findByIdAndUpdate(
      giftId,
      {
        $set: {
          ...data,
          ...(typeof data.code === 'string' ? { code: data.code.toLowerCase() } : {}),
        },
      },
      { new: true },
    ).exec();
  }

  async deleteAdminGift(giftId: string): Promise<GiftCatalogDocument | null> {
    if (!Types.ObjectId.isValid(giftId)) {
      return null;
    }
    return GiftCatalogModel.findByIdAndDelete(giftId).exec();
  }

  async seedDefaultGifts(): Promise<void> {
    const count = await GiftCatalogModel.countDocuments();
    if (count > 0) return;

    const defaultGifts = [
      { name: 'Rose', code: 'rose', icon: 'rose', coinPrice: 10, sortOrder: 1 },
      { name: 'Rocket', code: 'rocket', icon: 'rocket', coinPrice: 20, sortOrder: 2 },
      { name: 'Love', code: 'love', icon: 'love', coinPrice: 50, sortOrder: 3 },
      { name: 'Gem', code: 'gem', icon: 'gem', coinPrice: 100, sortOrder: 4 },
      { name: 'Crown', code: 'crown', icon: 'crown', coinPrice: 200, sortOrder: 5 },
      { name: 'Diamond', code: 'diamond', icon: 'diamond', coinPrice: 500, sortOrder: 6 },
    ];

    await GiftCatalogModel.insertMany(defaultGifts);
  }

  async getCoinSettings(): Promise<CoinSettingDocument> {
    let setting = await CoinSettingModel.findOne().exec();
    if (!setting) {
      setting = await CoinSettingModel.create({
        coinsPerDollar: 100,
        minWithdrawalCoins: 1000,
        maxWithdrawalCoins: 500000,
      });
    }
    return setting;
  }

  async updateCoinSettings(
    data: { coinsPerDollar?: number; minWithdrawalCoins?: number; maxWithdrawalCoins?: number },
    adminUserId: string,
  ): Promise<CoinSettingDocument> {
    let setting = await CoinSettingModel.findOne().exec();
    if (!setting) {
      setting = new CoinSettingModel({
        coinsPerDollar: 100,
        minWithdrawalCoins: 1000,
        maxWithdrawalCoins: 500000,
      });
    }

    if (data.coinsPerDollar !== undefined) setting.coinsPerDollar = data.coinsPerDollar;
    if (data.minWithdrawalCoins !== undefined) setting.minWithdrawalCoins = data.minWithdrawalCoins;
    if (data.maxWithdrawalCoins !== undefined) setting.maxWithdrawalCoins = data.maxWithdrawalCoins;
    setting.updatedBy = new Types.ObjectId(adminUserId);

    return setting.save();
  }

  async updateUserStripeConnectAccount(
    userId: string,
    stripeConnectAccountId: string,
    stripeConnectOnboardingComplete: boolean,
  ) {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        stripeConnectAccountId,
        stripeConnectOnboardingComplete,
      },
      { new: true },
    ).exec();
  }

  async createTransaction(data: {
    userId: string;
    packageId?: string;
    coins: number;
    amount: number;
    currency: string;
    paymentProvider?: 'stripe' | 'diamond_conversion';
    stripePaymentIntentId?: string;
    stripeClientSecret?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CoinTransactionDocument> {
    const transaction = new CoinTransactionModel({
      userId: new Types.ObjectId(data.userId),
      packageId: data.packageId ? new Types.ObjectId(data.packageId) : undefined,
      coins: data.coins,
      amount: data.amount,
      currency: data.currency.toLowerCase(),
      paymentProvider: data.paymentProvider ?? 'stripe',
      stripePaymentIntentId: data.stripePaymentIntentId,
      stripeClientSecret: data.stripeClientSecret,
      status: 'pending',
      metadata: data.metadata,
    });

    return transaction.save();
  }

  async updatePaymentIntentDetails(
    transactionId: string,
    stripePaymentIntentId: string,
    stripeClientSecret: string,
  ): Promise<CoinTransactionDocument | null> {
    return CoinTransactionModel.findByIdAndUpdate(
      transactionId,
      {
        stripePaymentIntentId,
        stripeClientSecret,
      },
      { new: true },
    ).exec();
  }

  async findTransactionByPaymentIntentId(stripePaymentIntentId: string): Promise<CoinTransactionDocument | null> {
    return CoinTransactionModel.findOne({ stripePaymentIntentId }).exec();
  }

  async findTransactionById(transactionId: string): Promise<CoinTransactionDocument | null> {
    if (!Types.ObjectId.isValid(transactionId)) {
      return null;
    }
    return CoinTransactionModel.findById(transactionId).exec();
  }

  async completeTransactionAndAddCoins(
    stripePaymentIntentId: string,
  ): Promise<{ transaction: CoinTransactionDocument; newlyCompleted: boolean } | null> {
    const transaction = await CoinTransactionModel.findOne({ stripePaymentIntentId }).exec();

    if (!transaction) {
      return null;
    }

    if (transaction.status === 'completed') {
      return { transaction, newlyCompleted: false };
    }

    const updatedTransaction = await CoinTransactionModel.findOneAndUpdate(
      { _id: transaction._id, status: { $ne: 'completed' } },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    if (!updatedTransaction) {
      const current = await CoinTransactionModel.findById(transaction._id).exec();
      return current ? { transaction: current, newlyCompleted: false } : null;
    }

    await UserModel.findByIdAndUpdate(updatedTransaction.userId, {
      $inc: { coinBalance: updatedTransaction.coins },
    }).exec();

    return { transaction: updatedTransaction, newlyCompleted: true };
  }

  async completeTransactionByIdAndAddCoins(
    transactionId: string,
    paymentFields: Record<string, never> = {},
  ): Promise<{ transaction: CoinTransactionDocument; newlyCompleted: boolean } | null> {
    const transaction = await this.findTransactionById(transactionId);

    if (!transaction) {
      return null;
    }

    if (transaction.status === 'completed') {
      return { transaction, newlyCompleted: false };
    }

    const updatedTransaction = await CoinTransactionModel.findOneAndUpdate(
      { _id: transaction._id, status: { $ne: 'completed' } },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          ...paymentFields,
        },
      },
      { new: true },
    ).exec();

    if (!updatedTransaction) {
      const current = await CoinTransactionModel.findById(transaction._id).exec();
      return current ? { transaction: current, newlyCompleted: false } : null;
    }

    await UserModel.findByIdAndUpdate(updatedTransaction.userId, {
      $inc: { coinBalance: updatedTransaction.coins },
    }).exec();

    return { transaction: updatedTransaction, newlyCompleted: true };
  }

  async failTransaction(stripePaymentIntentId: string, reason: string): Promise<CoinTransactionDocument | null> {
    return CoinTransactionModel.findOneAndUpdate(
      { stripePaymentIntentId, status: 'pending' },
      {
        $set: {
          status: 'failed',
          failedAt: new Date(),
          failureReason: reason,
        },
      },
      { new: true },
    ).exec();
  }

  async getUserBalance(userId: string): Promise<number> {
    const user = await UserModel.findById(userId).select('coinBalance').lean().exec();
    return user?.coinBalance ?? 0;
  }

  async getUserMoneyBalance(userId: string): Promise<{
    availableBalanceUsd: number;
    pendingBalanceUsd: number;
    totalBalanceUsd: number;
  }> {
    const user = await UserModel.findById(userId)
      .select('availableBalanceUsd pendingBalanceUsd')
      .lean()
      .exec();
    const availableBalanceUsd = Number((user?.availableBalanceUsd ?? 0).toFixed(2));
    const pendingBalanceUsd = Number((user?.pendingBalanceUsd ?? 0).toFixed(2));

    return {
      availableBalanceUsd,
      pendingBalanceUsd,
      totalBalanceUsd: Number((availableBalanceUsd + pendingBalanceUsd).toFixed(2)),
    };
  }

  async getUserDiamondBalance(userId: string): Promise<number> {
    const user = await UserModel.findById(userId).select('diamondBalance').lean().exec();
    return user?.diamondBalance ?? 0;
  }

  async convertDiamondsToCoins(data: {
    userId: string;
    diamonds: number;
    coins: number;
    amountUsd: number;
  }): Promise<{ diamondBalance: number; coinBalance: number } | null> {
    const userObjectId = new Types.ObjectId(data.userId);
    const updatedUser = await UserModel.findOneAndUpdate(
      { _id: userObjectId, diamondBalance: { $gte: data.diamonds } },
      { $inc: { diamondBalance: -data.diamonds, coinBalance: data.coins } },
      { new: true },
    ).select('diamondBalance coinBalance').lean().exec();

    if (!updatedUser) {
      return null;
    }

    await CoinTransactionModel.create({
      userId: userObjectId,
      coins: data.coins,
      amount: data.amountUsd,
      currency: 'usd',
      paymentProvider: 'diamond_conversion',
      status: 'completed',
      completedAt: new Date(),
      metadata: {
        source: 'diamond_conversion',
        diamonds: data.diamonds,
      },
    });

    return {
      diamondBalance: updatedUser.diamondBalance ?? 0,
      coinBalance: updatedUser.coinBalance ?? 0,
    };
  }

  async getUserTransactions(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ transactions: CoinTransactionDocument[]; total: number }> {
    const userObjectId = new Types.ObjectId(userId);
    const [transactions, total] = await Promise.all([
      CoinTransactionModel.find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('packageId', 'name coins price currency isPopular')
        .exec(),
      CoinTransactionModel.countDocuments({ userId: userObjectId }),
    ]);

    return { transactions, total };
  }

  async getAdminTransactions(
    skip: number,
    limit: number,
  ): Promise<{ transactions: CoinTransactionDocument[]; total: number }> {
    const [transactions, total] = await Promise.all([
      CoinTransactionModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email profile.displayName profile.username profile.photoUrl')
        .populate('packageId', 'name coins price currency isPopular')
        .exec(),
      CoinTransactionModel.countDocuments(),
    ]);

    return { transactions, total };
  }

  async sendGiftAndDeductCoins(data: {
    senderId: string;
    recipientId: string;
    targetType: GiftTargetType;
    targetId: string;
    giftId: string;
    giftName: string;
    coinPrice: number;
    quantity: number;
    totalCoins: number;
  }): Promise<SentGiftDocument> {
    const senderObjectId = new Types.ObjectId(data.senderId);

    const updatedSender = await UserModel.findOneAndUpdate(
      { _id: senderObjectId, coinBalance: { $gte: data.totalCoins } },
      { $inc: { coinBalance: -data.totalCoins } },
      { new: true },
    ).exec();

    if (!updatedSender) {
      throw new Error('INSUFFICIENT_COINS');
    }

    await UserModel.findByIdAndUpdate(data.recipientId, {
      $inc: { diamondBalance: data.totalCoins },
    }).exec();

    const sentGift = new SentGiftModel({
      senderId: senderObjectId,
      recipientId: new Types.ObjectId(data.recipientId),
      targetType: data.targetType,
      targetId: new Types.ObjectId(data.targetId),
      giftId: new Types.ObjectId(data.giftId),
      giftName: data.giftName,
      coinPrice: data.coinPrice,
      quantity: data.quantity,
      totalCoins: data.totalCoins,
    });

    await sentGift.save();

    if (data.targetType === 'reel') {
      await ReelModel.findByIdAndUpdate(data.targetId, {
        $inc: { giftsCount: data.quantity, giftsTotalCoins: data.totalCoins },
      }).exec();
    } else if (data.targetType === 'live-stream') {
      await LiveStreamModel.findByIdAndUpdate(data.targetId, {
        $inc: { giftsCount: data.quantity },
      }).exec();
    }

    return sentGift;
  }

  async getUserSentGifts(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ gifts: SentGiftDocument[]; total: number }> {
    const senderObjectId = new Types.ObjectId(userId);
    const [gifts, total] = await Promise.all([
      SentGiftModel.find({ senderId: senderObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('recipientId', 'profile.displayName profile.username profile.photoUrl')
        .populate('giftId', 'name icon coinPrice')
        .exec(),
      SentGiftModel.countDocuments({ senderId: senderObjectId }),
    ]);

    return { gifts, total };
  }

  async getUserReceivedGifts(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ gifts: SentGiftDocument[]; total: number }> {
    const recipientObjectId = new Types.ObjectId(userId);
    const [gifts, total] = await Promise.all([
      SentGiftModel.find({ recipientId: recipientObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderId', 'profile.displayName profile.username profile.photoUrl')
        .populate('giftId', 'name icon coinPrice')
        .exec(),
      SentGiftModel.countDocuments({ recipientId: recipientObjectId }),
    ]);

    return { gifts, total };
  }

  async getTargetGiftSummary(targetType: GiftTargetType, targetId: string) {
    if (!Types.ObjectId.isValid(targetId)) {
      return { totalGifts: 0, totalCoins: 0, topGifts: [] };
    }

    const targetObjectId = new Types.ObjectId(targetId);

    const [summary] = await SentGiftModel.aggregate([
      { $match: { targetType, targetId: targetObjectId } },
      {
        $group: {
          _id: null,
          totalGifts: { $sum: '$quantity' },
          totalCoins: { $sum: '$totalCoins' },
        },
      },
    ]).exec();

    const topGifts = await SentGiftModel.aggregate([
      { $match: { targetType, targetId: targetObjectId } },
      {
        $group: {
          _id: '$giftName',
          count: { $sum: '$quantity' },
          coins: { $sum: '$totalCoins' },
        },
      },
      { $sort: { coins: -1 } },
      { $limit: 10 },
    ]).exec();

    return {
      totalGifts: summary?.totalGifts ?? 0,
      totalCoins: summary?.totalCoins ?? 0,
      topGifts: topGifts.map((g) => ({
        giftName: g._id,
        count: g.count,
        coins: g.coins,
      })),
    };
  }

  async createWithdrawalRequestAndHoldCoins(data: {
    userId: string;
    stripeConnectAccountId: string;
    coins: number;
    coinsPerDollar: number;
    amountUsd: number;
  }): Promise<WithdrawalRequestDocument> {
    void data;
    throw new Error('PURCHASED_COINS_NOT_WITHDRAWABLE');
  }

  async createEarningWithdrawalRequestAndHoldBalance(data: {
    userId: string;
    stripeConnectAccountId: string;
    amountUsd: number;
  }): Promise<WithdrawalRequestDocument> {
    const userObjectId = new Types.ObjectId(data.userId);
    const amountUsd = Number(data.amountUsd.toFixed(2));

    const updatedUser = await UserModel.findOneAndUpdate(
      { _id: userObjectId, availableBalanceUsd: { $gte: amountUsd } },
      { $inc: { availableBalanceUsd: -amountUsd } },
      { new: true },
    ).exec();

    if (!updatedUser) {
      throw new Error('INSUFFICIENT_EARNINGS');
    }

    const withdrawal = new WithdrawalRequestModel({
      userId: userObjectId,
      stripeConnectAccountId: data.stripeConnectAccountId,
      withdrawalType: 'earnings',
      coins: 0,
      coinsPerDollar: 0,
      amountUsd,
      currency: 'usd',
      status: 'pending',
    });

    return withdrawal.save();
  }

  async findWithdrawalRequestById(requestId: string): Promise<WithdrawalRequestDocument | null> {
    if (!Types.ObjectId.isValid(requestId)) {
      return null;
    }
    return WithdrawalRequestModel.findById(requestId).exec();
  }

  async approveAndMarkCompleted(
    requestId: string,
    adminUserId: string,
    stripeTransferId: string,
    notes?: string,
  ): Promise<WithdrawalRequestDocument | null> {
    return WithdrawalRequestModel.findOneAndUpdate(
      { _id: requestId, status: { $in: ['approved', 'processing'] } },
      {
        $set: {
          status: 'completed',
          stripeTransferId,
          processedBy: new Types.ObjectId(adminUserId),
          processedAt: new Date(),
          adminNotes: notes,
        },
      },
      { new: true },
    ).exec();
  }

  async markWithdrawalStatus(
    requestId: string,
    status: Extract<WithdrawalStatus, 'approved' | 'processing' | 'pending'>,
    adminUserId?: string,
    notes?: string,
  ): Promise<WithdrawalRequestDocument | null> {
    return WithdrawalRequestModel.findOneAndUpdate(
      { _id: requestId, status: { $in: ['pending', 'approved', 'processing'] } },
      {
        $set: {
          status,
          ...(adminUserId ? { processedBy: new Types.ObjectId(adminUserId) } : {}),
          ...(status === 'pending' ? {} : { processedAt: new Date() }),
          ...(notes !== undefined ? { adminNotes: notes } : {}),
        },
      },
      { new: true },
    ).exec();
  }

  async rejectAndRefundWithdrawal(
    requestId: string,
    adminUserId: string,
    reason: string,
  ): Promise<WithdrawalRequestDocument | null> {
    const withdrawal = await WithdrawalRequestModel.findOne({ _id: requestId, status: { $in: ['pending', 'approved', 'processing'] } }).exec();

    if (!withdrawal) {
      return null;
    }

    const updated = await WithdrawalRequestModel.findOneAndUpdate(
      { _id: withdrawal._id, status: { $in: ['pending', 'approved', 'processing'] } },
      {
        $set: {
          status: 'rejected',
          adminNotes: reason,
          processedBy: new Types.ObjectId(adminUserId),
          processedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    if (!updated) {
      return null;
    }

    await UserModel.findByIdAndUpdate(withdrawal.userId, {
      $inc: { availableBalanceUsd: withdrawal.amountUsd },
    }).exec();

    return updated;
  }

  async getUserWithdrawalRequests(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<{ items: WithdrawalRequestDocument[]; total: number }> {
    const userObjectId = new Types.ObjectId(userId);
    const [items, total] = await Promise.all([
      WithdrawalRequestModel.find({ userId: userObjectId }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      WithdrawalRequestModel.countDocuments({ userId: userObjectId }),
    ]);

    return { items, total };
  }

  async getUserPendingWithdrawalSummary(
    userId: string,
  ): Promise<{ coins: number; amountUsd: number; count: number }> {
    const userObjectId = new Types.ObjectId(userId);
    const [summary] = await WithdrawalRequestModel.aggregate<{ coins: number; amountUsd: number; count: number }>([
      {
        $match: {
          userId: userObjectId,
          status: { $in: ['pending', 'approved', 'processing'] },
        },
      },
      {
        $group: {
          _id: null,
          coins: { $sum: '$coins' },
          amountUsd: { $sum: '$amountUsd' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          coins: 1,
          amountUsd: 1,
          count: 1,
        },
      },
    ]).exec();

    return {
      coins: summary?.coins ?? 0,
      amountUsd: Number((summary?.amountUsd ?? 0).toFixed(2)),
      count: summary?.count ?? 0,
    };
  }

  async getAdminWithdrawalRequests(
    status: WithdrawalStatus | 'all',
    skip: number,
    limit: number,
  ): Promise<{ items: WithdrawalRequestDocument[]; total: number }> {
    const query = status === 'all' ? {} : { status };
    const [items, total] = await Promise.all([
      WithdrawalRequestModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email profile.displayName profile.username profile.photoUrl coinBalance stripeConnectAccountId stripeConnectOnboardingComplete')
        .exec(),
      WithdrawalRequestModel.countDocuments(query),
    ]);

    return { items, total };
  }
}

export const coinRepository = new CoinRepository();
