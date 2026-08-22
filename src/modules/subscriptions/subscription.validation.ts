import { z } from 'zod';

export const subscriptionPlanIds = ['monthly', 'yearly'] as const;
export type SubscriptionPlanId = (typeof subscriptionPlanIds)[number];

export const createSquareSubscriptionSchema = {
  body: z.object({
    planId: z.enum(subscriptionPlanIds),
    sourceId: z.string().trim().min(1, 'Square payment source is required.'),
  }),
};

export type CreateSquareSubscriptionInput = z.infer<typeof createSquareSubscriptionSchema.body>;
