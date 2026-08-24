import { z } from 'zod';

export const subscriptionPlanIds = ['monthly', 'yearly'] as const;
export type SubscriptionPlanId = (typeof subscriptionPlanIds)[number];

export const syncRevenueCatSubscriptionSchema = {
  body: z.object({
    planId: z.enum(subscriptionPlanIds),
    platform: z.enum(['ios', 'android']),
    productIdentifier: z.string().trim().min(1).max(200).optional(),
  }),
};

export type SyncRevenueCatSubscriptionInput = z.infer<typeof syncRevenueCatSubscriptionSchema.body>;
