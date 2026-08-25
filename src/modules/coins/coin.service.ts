import type Stripe from 'stripe';
import { stripe } from '../../config/stripe.config.js';
import { env } from '../../config/env.config.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { coinRepository } from './coin.repository.js';
import { UserModel } from '../users/user.model.js';
import { ReelModel } from '../reels/reel.model.js';
import { LiveStreamModel } from '../live-streams/live-stream.model.js';
import type {
  ConvertDiamondsInput,
  CreateAdminCoinPackageInput,
  CreateAdminGiftInput,
  SendGiftInput,
  UpdateAdminCoinPackageInput,
  UpdateAdminGiftInput,
  UpdateCoinSettingsInput,
} from './coin.validation.js';
import { activityService } from '../activities/activity.service.js';
import type { GiftTargetType } from './sent-gift.model.js';
import type { WithdrawalStatus } from './withdrawal-request.model.js';
import { adminNotificationService } from '../notifications/admin-notification.service.js';

export class CoinService {
  async getPackages() {
    const packages = await coinRepository.getActivePackages();
    return packages.map((pkg) => ({
      id: pkg._id.toString(),
      name: pkg.name,
      coins: pkg.coins,
      price: pkg.price,
      currency: pkg.currency,
      isPopular: pkg.isPopular,
      sortOrder: pkg.sortOrder,
    }));
  }

  async getAdminPackages() {
    const packages = await coinRepository.getAdminPackages();
    return packages.map(mapCoinPackage);
  }

  async createAdminPackage(input: CreateAdminCoinPackageInput) {
    const created = await coinRepository.createAdminPackage(input);
    return mapCoinPackage(created);
  }

  async updateAdminPackage(packageId: string, input: UpdateAdminCoinPackageInput) {
    const updated = await coinRepository.updateAdminPackage(packageId, input);
    if (!updated) {
      throw new NotFoundError('Coin package was not found.');
    }
    return mapCoinPackage(updated);
  }

  async deleteAdminPackage(packageId: string) {
    const deleted = await coinRepository.deleteAdminPackage(packageId);
    if (!deleted) {
      throw new NotFoundError('Coin package was not found.');
    }
    return { deleted: true, id: deleted._id.toString() };
  }

  async getUserCoinBalance(userId: string) {
    const [balance, moneyBalance] = await Promise.all([
      coinRepository.getUserBalance(userId),
      coinRepository.getUserMoneyBalance(userId),
    ]);
    return {
      userId,
      coinBalance: balance,
      ...moneyBalance,
    };
  }

  async getUserDiamondBalance(userId: string) {
    const [diamondBalance, setting] = await Promise.all([
      coinRepository.getUserDiamondBalance(userId),
      coinRepository.getCoinSettings(),
    ]);

    return {
      userId,
      diamondBalance,
      diamondsPerDollar: setting.coinsPerDollar,
      estimatedUsdValue: Number((diamondBalance / setting.coinsPerDollar).toFixed(2)),
    };
  }

  async convertDiamonds(userId: string, input: ConvertDiamondsInput) {
    const setting = await coinRepository.getCoinSettings();
    const amountUsd = Number((input.diamonds / setting.coinsPerDollar).toFixed(2));
    const result = await coinRepository.convertDiamondsToCoins({
      userId,
      diamonds: input.diamonds,
      coins: input.diamonds,
      amountUsd,
    });

    if (!result) {
      const currentDiamondBalance = await coinRepository.getUserDiamondBalance(userId);
      throw new BadRequestError(
        `Insufficient diamond balance. You have ${currentDiamondBalance} diamonds but requested ${input.diamonds}.`,
      );
    }

    return {
      converted: true,
      diamondsConverted: input.diamonds,
      amountUsd,
      coinBalance: result.coinBalance,
      diamondBalance: result.diamondBalance,
      diamondsPerDollar: setting.coinsPerDollar,
    };
  }

  async getGiftCatalog() {
    const gifts = await coinRepository.getActiveGifts();
    return gifts.map((g) => ({
      id: g._id.toString(),
      name: g.name,
      code: g.code,
      icon: g.icon,
      coinPrice: g.coinPrice,
      sortOrder: g.sortOrder,
    }));
  }

  async getAdminGiftCatalog() {
    const gifts = await coinRepository.getAdminGifts();
    return gifts.map(mapGiftCatalog);
  }

  async createAdminGift(input: CreateAdminGiftInput) {
    const created = await coinRepository.createAdminGift(input);
    return mapGiftCatalog(created);
  }

  async updateAdminGift(giftId: string, input: UpdateAdminGiftInput) {
    const updated = await coinRepository.updateAdminGift(giftId, input);
    if (!updated) {
      throw new NotFoundError('Gift was not found.');
    }
    return mapGiftCatalog(updated);
  }

  async deleteAdminGift(giftId: string) {
    const deleted = await coinRepository.deleteAdminGift(giftId);
    if (!deleted) {
      throw new NotFoundError('Gift was not found.');
    }
    return { deleted: true, id: deleted._id.toString() };
  }

  async sendGift(senderId: string, input: SendGiftInput) {
    const { targetType, targetId, giftId, quantity = 1 } = input;

    const gift = await coinRepository.getGiftById(giftId);
    if (!gift || !gift.isActive) {
      throw new NotFoundError('Gift not found or inactive.');
    }

    let recipientId: string | undefined;

    if (targetType === 'reel') {
      const reel = await ReelModel.findById(targetId).select('ownerId status').exec();
      if (!reel) {
        throw new NotFoundError('Target video/reel not found.');
      }
      recipientId = reel.ownerId.toString();
    } else if (targetType === 'live-stream') {
      const stream = await LiveStreamModel.findById(targetId).select('hostId status').exec();
      if (!stream) {
        throw new NotFoundError('Target live stream not found.');
      }
      recipientId = stream.hostId.toString();
    } else {
      throw new BadRequestError('Unsupported target type for gifting.');
    }

    if (senderId === recipientId) {
      throw new BadRequestError('You cannot send a gift to your own post or stream.');
    }

    const totalCoins = gift.coinPrice * quantity;
    const userBalance = await coinRepository.getUserBalance(senderId);

    if (userBalance < totalCoins) {
      throw new BadRequestError(
        `Insufficient coin balance. You need ${totalCoins} coins but currently have ${userBalance} coins. Please purchase more coins.`,
      );
    }

    let sentGiftRecord;
    try {
      sentGiftRecord = await coinRepository.sendGiftAndDeductCoins({
        senderId,
        recipientId,
        targetType: targetType as GiftTargetType,
        targetId,
        giftId: gift._id.toString(),
        giftName: gift.name,
        coinPrice: gift.coinPrice,
        quantity,
        totalCoins,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
        throw new BadRequestError('Insufficient coin balance. Please purchase more coins.');
      }
      throw err;
    }

    const remainingBalance = await coinRepository.getUserBalance(senderId);

    // Map targetType to entityModel based on typical mappings
    const entityModelMap: Record<string, 'Reel' | 'LiveStream' | 'Message' | 'User'> = {
      reel: 'Reel',
      live_stream: 'LiveStream',
      message: 'Message',
      profile: 'User'
    };
    const entityModel = entityModelMap[targetType] || 'User';

    // Log for sender
    activityService.logActivity({
      userId: senderId,
      actionType: 'gift_sent',
      entityId: targetId,
      entityModel,
      metadata: { giftName: gift.name, quantity, totalCoins }
    }).catch(console.error);

    // Log for recipient
    if (recipientId !== senderId) {
      activityService.logActivity({
        userId: recipientId,
        actorId: senderId,
        actionType: 'gift_received',
        entityId: targetId,
        entityModel,
        metadata: { giftName: gift.name, quantity, totalCoins }
      }).catch(console.error);
    }

    return {
      giftSent: true,
      transactionId: sentGiftRecord._id.toString(),
      senderId,
      recipientId,
      targetType,
      targetId,
      gift: {
        id: gift._id.toString(),
        name: gift.name,
        icon: gift.icon,
        coinPrice: gift.coinPrice,
        quantity,
        totalCoins,
      },
      remainingCoinBalance: remainingBalance,
    };
  }

  async getUserSentGifts(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { gifts, total } = await coinRepository.getUserSentGifts(userId, skip, limit);

    return {
      items: gifts.map((g) => ({
        id: g._id.toString(),
        giftName: g.giftName,
        coinPrice: g.coinPrice,
        quantity: g.quantity,
        totalCoins: g.totalCoins,
        targetType: g.targetType,
        targetId: g.targetId.toString(),
        recipient: g.recipientId,
        createdAt: g.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserReceivedGifts(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { gifts, total } = await coinRepository.getUserReceivedGifts(userId, skip, limit);

    return {
      items: gifts.map((g) => ({
        id: g._id.toString(),
        giftName: g.giftName,
        coinPrice: g.coinPrice,
        quantity: g.quantity,
        totalCoins: g.totalCoins,
        targetType: g.targetType,
        targetId: g.targetId.toString(),
        sender: g.senderId,
        createdAt: g.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTargetGiftSummary(targetType: GiftTargetType, targetId: string) {
    return coinRepository.getTargetGiftSummary(targetType, targetId);
  }

  async createPaymentIntent(userId: string, packageId: string) {
    const coinPackage = await coinRepository.getPackageById(packageId);

    if (!coinPackage || !coinPackage.isActive) {
      throw new NotFoundError('Coin package not found or no longer available.');
    }

    const amountInCents = Math.round(coinPackage.price * 100);

    const transaction = await coinRepository.createTransaction({
      userId,
      packageId: coinPackage._id.toString(),
      coins: coinPackage.coins,
      amount: coinPackage.price,
      currency: coinPackage.currency,
      metadata: {
        packageName: coinPackage.name,
      },
    });

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: coinPackage.currency,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          transactionId: transaction._id.toString(),
          userId,
          packageId: coinPackage._id.toString(),
          coins: coinPackage.coins.toString(),
        },
      });

      await coinRepository.updatePaymentIntentDetails(
        transaction._id.toString(),
        paymentIntent.id,
        paymentIntent.client_secret ?? '',
      );

      return {
        transactionId: transaction._id.toString(),
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? '',
        amount: coinPackage.price,
        currency: coinPackage.currency,
        coins: coinPackage.coins,
        packageId: coinPackage._id.toString(),
      };
    } catch (error) {
      await coinRepository.failTransaction(
        transaction._id.toString(),
        error instanceof Error ? error.message : 'Failed to create payment intent',
      );
      throw new BadRequestError(
        `Stripe PaymentIntent creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async handleStripeWebhook(rawBody: Buffer | string, signature?: string) {
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;

    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err) {
        throw new BadRequestError(`Stripe Webhook Signature Verification Failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      try {
        const payloadStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
        event = JSON.parse(payloadStr) as Stripe.Event;
      } catch {
        throw new BadRequestError('Invalid Stripe webhook payload format.');
      }
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await coinRepository.completeTransactionAndAddCoins(paymentIntent.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const reason = paymentIntent.last_payment_error?.message || 'Payment failed';
        await coinRepository.failTransaction(paymentIntent.id, reason);
        break;
      }
      default:
        break;
    }

    return { received: true, eventType: event.type };
  }

  async verifyPaymentIntent(userId: string, paymentIntentId: string) {
    const transaction = await coinRepository.findTransactionByPaymentIntentId(paymentIntentId);

    if (!transaction) {
      throw new NotFoundError('Transaction record for this payment intent was not found.');
    }

    if (transaction.userId.toString() !== userId) {
      throw new BadRequestError('Transaction does not belong to the authenticated user.');
    }

    if (transaction.status === 'completed') {
      const currentBalance = await coinRepository.getUserBalance(userId);
      return {
        status: 'completed',
        coinsCredited: false,
        coinBalance: currentBalance,
        coinsAdded: transaction.coins,
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const result = await coinRepository.completeTransactionAndAddCoins(paymentIntentId);
      const currentBalance = await coinRepository.getUserBalance(userId);

      return {
        status: 'completed',
        coinsCredited: result?.newlyCompleted ?? true,
        coinBalance: currentBalance,
        coinsAdded: transaction.coins,
      };
    } else if (paymentIntent.status === 'canceled' || paymentIntent.status === 'requires_payment_method') {
      const reason = paymentIntent.last_payment_error?.message || `PaymentIntent status: ${paymentIntent.status}`;
      await coinRepository.failTransaction(paymentIntentId, reason);
    }

    const currentBalance = await coinRepository.getUserBalance(userId);
    return {
      status: paymentIntent.status,
      coinsCredited: false,
      coinBalance: currentBalance,
      coinsAdded: 0,
    };
  }

  async getTransactionHistory(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { transactions, total } = await coinRepository.getUserTransactions(userId, skip, limit);

    return {
      items: transactions.map((t) => ({
        id: t._id.toString(),
        coins: t.coins,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        paymentProvider: t.paymentProvider,
        stripePaymentIntentId: t.stripePaymentIntentId,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminTransactionHistory(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { transactions, total } = await coinRepository.getAdminTransactions(skip, limit);

    return {
      items: transactions.map((t) => ({
        id: t._id.toString(),
        user: formatTransactionUser(t.userId),
        type: t.paymentProvider === 'diamond_conversion' ? 'Diamond conversion' : 'Coin purchase',
        coins: t.coins,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        paymentProvider: t.paymentProvider,
        stripePaymentIntentId: t.stripePaymentIntentId,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- STRIPE CONNECT PAYOUT & WITHDRAWAL METHODS ---

  async createStripeConnectAccountLink(userId: string, returnUrl?: string, refreshUrl?: string) {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    let accountId = user.stripeConnectAccountId;

    if (!accountId) {
      const account = await this.createStripeConnectAccount(userId, user.email);
      accountId = account.id;
      await coinRepository.updateUserStripeConnectAccount(userId, accountId, false);
    }

    const accountLink = await this.createStripeConnectOnboardingLink(
      accountId,
      refreshUrl || buildStripeConnectRedirectUrl('/payouts/stripe-connect/refresh'),
      returnUrl || buildStripeConnectRedirectUrl('/payouts/stripe-connect/return'),
    );

    return {
      url: accountLink.url,
      stripeConnectAccountId: accountId,
    };
  }

  private async createStripeConnectAccount(userId: string, email?: string) {
    try {
      return await stripe.accounts.create({
        type: 'express',
        ...(email ? { email } : {}),
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          userId,
        },
      });
    } catch (error) {
      throw toStripeConnectSetupError(error);
    }
  }

  private async createStripeConnectOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string) {
    try {
      return await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
    } catch (error) {
      throw toStripeConnectSetupError(error);
    }
  }

  async checkStripeConnectStatus(userId: string) {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    if (!user.stripeConnectAccountId) {
      return {
        connected: false,
        stripeConnectAccountId: null,
        detailsSubmitted: false,
        payoutsEnabled: false,
      };
    }

    try {
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
      const detailsSubmitted = account.details_submitted ?? false;
      const payoutsEnabled = account.payouts_enabled ?? false;

      if (user.stripeConnectOnboardingComplete !== payoutsEnabled) {
        await coinRepository.updateUserStripeConnectAccount(userId, user.stripeConnectAccountId, payoutsEnabled);
      }

      return {
        connected: true,
        stripeConnectAccountId: account.id,
        detailsSubmitted,
        payoutsEnabled,
      };
    } catch {
      return {
        connected: true,
        stripeConnectAccountId: user.stripeConnectAccountId,
        detailsSubmitted: false,
        payoutsEnabled: user.stripeConnectOnboardingComplete ?? false,
      };
    }
  }

  async getWithdrawalSettings(userId: string) {
    const setting = await coinRepository.getCoinSettings();
    const [user, pendingWithdrawal] = await Promise.all([
      UserModel.findById(userId).select('coinBalance availableBalanceUsd pendingBalanceUsd stripeConnectAccountId stripeConnectOnboardingComplete').exec(),
      coinRepository.getUserPendingWithdrawalSummary(userId),
    ]);
    const coinBalance = user?.coinBalance ?? 0;
    const estimatedUsdValue = Number((coinBalance / setting.coinsPerDollar).toFixed(2));
    let stripeConnectOnboardingComplete = user?.stripeConnectOnboardingComplete ?? false;

    if (user?.stripeConnectAccountId) {
      try {
        const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
        stripeConnectOnboardingComplete = account.payouts_enabled ?? false;

        if (user.stripeConnectOnboardingComplete !== stripeConnectOnboardingComplete) {
          await coinRepository.updateUserStripeConnectAccount(
            userId,
            user.stripeConnectAccountId,
            stripeConnectOnboardingComplete,
          );
        }
      } catch {
        stripeConnectOnboardingComplete = user.stripeConnectOnboardingComplete ?? false;
      }
    }

    return {
      coinsPerDollar: setting.coinsPerDollar,
      minWithdrawalCoins: setting.minWithdrawalCoins,
      maxWithdrawalCoins: setting.maxWithdrawalCoins,
      userCoinBalance: coinBalance,
      estimatedUsdValue,
      availableBalanceUsd: Number((user?.availableBalanceUsd ?? 0).toFixed(2)),
      pendingBalanceUsd: Number((user?.pendingBalanceUsd ?? 0).toFixed(2)),
      totalBalanceUsd: Number(((user?.availableBalanceUsd ?? 0) + (user?.pendingBalanceUsd ?? 0)).toFixed(2)),
      pendingWithdrawalCoins: pendingWithdrawal.coins,
      pendingWithdrawalUsdValue: pendingWithdrawal.amountUsd,
      pendingWithdrawalCount: pendingWithdrawal.count,
      stripeConnectAccountId: user?.stripeConnectAccountId,
      stripeConnectOnboardingComplete,
      payoutSetupAvailable: Boolean(env.STRIPE_SECRET_KEY),
    };
  }

  async requestWithdrawal(userId: string, coins: number) {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    if (!user.stripeConnectAccountId || !user.stripeConnectOnboardingComplete) {
      throw new BadRequestError('Please setup your payout account before requesting a withdrawal.');
    }

    const setting = await coinRepository.getCoinSettings();

    if (coins < setting.minWithdrawalCoins) {
      throw new BadRequestError(`Minimum withdrawal amount is ${setting.minWithdrawalCoins} coins.`);
    }

    if (coins > setting.maxWithdrawalCoins) {
      throw new BadRequestError(`Maximum withdrawal amount per request is ${setting.maxWithdrawalCoins} coins.`);
    }

    if (user.coinBalance < coins) {
      throw new BadRequestError(`Insufficient coin balance. You have ${user.coinBalance} coins but requested ${coins}.`);
    }

    const amountUsd = Number((coins / setting.coinsPerDollar).toFixed(2));

    let withdrawal;
    try {
      withdrawal = await coinRepository.createWithdrawalRequestAndHoldCoins({
        userId,
        stripeConnectAccountId: user.stripeConnectAccountId,
        coins,
        coinsPerDollar: setting.coinsPerDollar,
        amountUsd,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_COINS') {
        throw new BadRequestError('Insufficient coin balance.');
      }
      throw err;
    }

    const remainingBalance = await coinRepository.getUserBalance(userId);

    void adminNotificationService.notifyAdmins({
      event: 'withdrawal_request_submitted',
      title: 'New withdrawal request',
      body: `A creator requested ${withdrawal.coins} coins withdrawal ($${withdrawal.amountUsd}).`,
      relatedEntityId: withdrawal._id.toString(),
    });

    return {
      withdrawalId: withdrawal._id.toString(),
      withdrawalType: withdrawal.withdrawalType,
      coins: withdrawal.coins,
      coinsPerDollar: withdrawal.coinsPerDollar,
      amountUsd: withdrawal.amountUsd,
      status: withdrawal.status,
      remainingCoinBalance: remainingBalance,
      createdAt: withdrawal.createdAt.toISOString(),
    };
  }

  async requestEarningWithdrawal(userId: string) {
    const user = await UserModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    if (!user.stripeConnectAccountId || !user.stripeConnectOnboardingComplete) {
      throw new BadRequestError('Please setup your payout account before requesting a withdrawal.');
    }

    const setting = await coinRepository.getCoinSettings();
    const minimumUsd = Number((setting.minWithdrawalCoins / setting.coinsPerDollar).toFixed(2));
    const amountUsd = Number((user.availableBalanceUsd ?? 0).toFixed(2));

    if (amountUsd < minimumUsd) {
      throw new BadRequestError(`Minimum withdrawal amount is $${minimumUsd.toFixed(2)}.`);
    }

    let withdrawal;
    try {
      withdrawal = await coinRepository.createEarningWithdrawalRequestAndHoldBalance({
        userId,
        stripeConnectAccountId: user.stripeConnectAccountId,
        amountUsd,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_EARNINGS') {
        throw new BadRequestError('Insufficient available earning balance.');
      }
      throw err;
    }

    void adminNotificationService.notifyAdmins({
      event: 'withdrawal_request_submitted',
      title: 'New earning withdrawal request',
      body: `A creator requested $${withdrawal.amountUsd} earning withdrawal.`,
      relatedEntityId: withdrawal._id.toString(),
    });

    return {
      withdrawalId: withdrawal._id.toString(),
      withdrawalType: withdrawal.withdrawalType,
      coins: withdrawal.coins,
      coinsPerDollar: withdrawal.coinsPerDollar,
      amountUsd: withdrawal.amountUsd,
      status: withdrawal.status,
      remainingAvailableBalanceUsd: 0,
      createdAt: withdrawal.createdAt.toISOString(),
    };
  }

  async approveWithdrawal(adminUserId: string, requestId: string, adminNotes?: string) {
    const withdrawal = await coinRepository.findWithdrawalRequestById(requestId);
    if (!withdrawal) {
      throw new NotFoundError('Withdrawal request not found.');
    }

    if (withdrawal.status !== 'pending') {
      throw new BadRequestError(`Withdrawal request is already ${withdrawal.status}. Only pending requests can be approved.`);
    }

    const amountInCents = Math.round(withdrawal.amountUsd * 100);

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: amountInCents,
        currency: 'usd',
        destination: withdrawal.stripeConnectAccountId,
        description: withdrawal.withdrawalType === 'earnings'
          ? `Creator earning payout ${withdrawal._id.toString()}`
          : `Payout for ${withdrawal.coins} coins withdrawal`,
        metadata: {
          withdrawalId: withdrawal._id.toString(),
          userId: withdrawal.userId.toString(),
        },
      });
    } catch (err) {
      throw new BadRequestError(`Stripe Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const updated = await coinRepository.approveAndMarkTransferred(
      requestId,
      adminUserId,
      transfer.id,
      adminNotes,
    );

    return {
      approved: true,
      withdrawalId: requestId,
      stripeTransferId: transfer.id,
      amountUsd: withdrawal.amountUsd,
      withdrawalType: withdrawal.withdrawalType,
      coins: withdrawal.coins,
      status: updated?.status ?? 'transferred',
    };
  }

  async rejectWithdrawal(adminUserId: string, requestId: string, reason: string) {
    const withdrawal = await coinRepository.findWithdrawalRequestById(requestId);
    if (!withdrawal) {
      throw new NotFoundError('Withdrawal request not found.');
    }

    if (withdrawal.status !== 'pending') {
      throw new BadRequestError(`Withdrawal request is already ${withdrawal.status}. Only pending requests can be rejected.`);
    }

    const updated = await coinRepository.rejectAndRefundWithdrawal(requestId, adminUserId, reason);

    return {
      rejected: true,
      withdrawalId: requestId,
      withdrawalType: withdrawal.withdrawalType,
      refundedCoins: withdrawal.coins,
      refundedAmountUsd: withdrawal.withdrawalType === 'earnings' ? withdrawal.amountUsd : 0,
      status: updated?.status ?? 'rejected',
      adminNotes: reason,
    };
  }

  async getUserWithdrawalHistory(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { items, total } = await coinRepository.getUserWithdrawalRequests(userId, skip, limit);

    return {
      items: items.map((w) => ({
        id: w._id.toString(),
        withdrawalType: w.withdrawalType ?? 'coins',
        coins: w.coins,
        coinsPerDollar: w.coinsPerDollar,
        amountUsd: w.amountUsd,
        currency: w.currency,
        status: w.status,
        stripeTransferId: w.stripeTransferId,
        adminNotes: w.adminNotes,
        createdAt: w.createdAt.toISOString(),
        processedAt: w.processedAt ? w.processedAt.toISOString() : undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminWithdrawalRequests(status: WithdrawalStatus | 'all', page: number, limit: number) {
    const skip = (page - 1) * limit;
    const { items, total } = await coinRepository.getAdminWithdrawalRequests(status, skip, limit);

    return {
      items: items.map((w) => ({
        id: w._id.toString(),
        user: w.userId,
        withdrawalType: w.withdrawalType ?? 'coins',
        coins: w.coins,
        coinsPerDollar: w.coinsPerDollar,
        amountUsd: w.amountUsd,
        currency: w.currency,
        status: w.status,
        stripeConnectAccountId: w.stripeConnectAccountId,
        stripeTransferId: w.stripeTransferId,
        adminNotes: w.adminNotes,
        createdAt: w.createdAt.toISOString(),
        processedAt: w.processedAt ? w.processedAt.toISOString() : undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateAdminCoinSettings(adminUserId: string, input: UpdateCoinSettingsInput) {
    const update = {
      coinsPerDollar: input.coinsPerDollar,
      ...(input.minWithdrawalCoins !== undefined
        ? { minWithdrawalCoins: input.minWithdrawalCoins }
        : {}),
      ...(input.maxWithdrawalCoins !== undefined
        ? { maxWithdrawalCoins: input.maxWithdrawalCoins }
        : {}),
    };
    const updated = await coinRepository.updateCoinSettings(update, adminUserId);
    return {
      coinsPerDollar: updated.coinsPerDollar,
      minWithdrawalCoins: updated.minWithdrawalCoins,
      maxWithdrawalCoins: updated.maxWithdrawalCoins,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async getAdminCoinSettings() {
    const setting = await coinRepository.getCoinSettings();
    return {
      coinsPerDollar: setting.coinsPerDollar,
      minWithdrawalCoins: setting.minWithdrawalCoins,
      maxWithdrawalCoins: setting.maxWithdrawalCoins,
      updatedAt: setting.updatedAt.toISOString(),
    };
  }
}

export const coinService = new CoinService();

function mapCoinPackage(pkg: any) {
  return {
    id: pkg._id.toString(),
    name: pkg.name,
    coins: pkg.coins,
    price: pkg.price,
    currency: pkg.currency,
    isPopular: pkg.isPopular,
    isActive: pkg.isActive,
    sortOrder: pkg.sortOrder,
    stripePriceId: pkg.stripePriceId,
    createdAt: pkg.createdAt?.toISOString?.(),
    updatedAt: pkg.updatedAt?.toISOString?.(),
  };
}

function mapGiftCatalog(gift: any) {
  return {
    id: gift._id.toString(),
    name: gift.name,
    code: gift.code,
    icon: gift.icon,
    coinPrice: gift.coinPrice,
    isActive: gift.isActive,
    sortOrder: gift.sortOrder,
    createdAt: gift.createdAt?.toISOString?.(),
    updatedAt: gift.updatedAt?.toISOString?.(),
  };
}

function formatTransactionUser(user: any): string {
  return (
    user?.profile?.displayName ||
    user?.profile?.username ||
    user?.email ||
    'Unknown user'
  );
}

function toStripeConnectSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return new BadRequestError(
    message.includes('signed up for Connect')
      ? 'Withdraw is not ready yet. Please enable Stripe Connect in your Stripe dashboard first.'
      : `Stripe Connect setup failed: ${message}`,
    {
      code: 'STRIPE_CONNECT_NOT_CONFIGURED',
      details: { stripeMessage: message },
    },
  );
}

function buildStripeConnectRedirectUrl(path: string) {
  const baseUrl = env.PUBLIC_BASE_URL?.replace(/\/+$/, '') ?? `http://localhost:${env.PORT}`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
