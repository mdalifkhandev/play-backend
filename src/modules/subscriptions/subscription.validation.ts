import { z } from 'zod';

export const subscriptionPlanIdSchema = z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9][a-z0-9_-]*$/);
export type SubscriptionPlanId = z.infer<typeof subscriptionPlanIdSchema>;

export const syncRevenueCatSubscriptionSchema = {
  body: z.object({
    planId: subscriptionPlanIdSchema,
    platform: z.enum(['ios', 'android']),
    productIdentifier: z.string().trim().min(1).max(200).optional(),
  }),
};

export type SyncRevenueCatSubscriptionInput = z.infer<typeof syncRevenueCatSubscriptionSchema.body>;

export const createStripeSubscriptionPaymentIntentSchema = {
  body: z.object({
    planId: subscriptionPlanIdSchema,
  }),
};

export const verifyStripeSubscriptionPaymentSchema = {
  body: z.object({
    paymentIntentId: z.string().trim().min(1, 'Payment Intent ID is required.'),
  }),
};

export const adminSubscriptionPlanIdParamSchema = z.object({
  planId: subscriptionPlanIdSchema,
});

export const adminSubscriberIdParamSchema = z.object({
  userId: z.string().trim().min(1, 'User ID is required.'),
});

export const adminUpdateSubscriberStatusSchema = {
  params: adminSubscriberIdParamSchema,
  body: z.object({
    status: z.enum(['active', 'hold', 'canceled']),
  }),
};

const featuresSchema = z.array(z.string().trim().min(1).max(140)).max(20).default([]);

export const adminCreateSubscriptionPlanSchema = {
  body: z.object({
    planId: subscriptionPlanIdSchema,
    name: z.string().trim().min(2).max(120),
    interval: z.enum(['month', 'year', 'lifetime']),
    price: z.coerce.number().min(0).max(100000),
    currency: z.literal('usd').default('usd'),
    discountLabel: z.string().trim().max(40).optional(),
    productIdentifier: z.string().trim().max(200).optional(),
    features: featuresSchema,
    isActive: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(0),
  }),
};

export const adminUpdateSubscriptionPlanSchema = {
  params: adminSubscriptionPlanIdParamSchema,
  body: adminCreateSubscriptionPlanSchema.body.partial().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  }),
};

export type AdminCreateSubscriptionPlanInput = z.infer<typeof adminCreateSubscriptionPlanSchema.body>;
export type AdminUpdateSubscriptionPlanInput = z.infer<typeof adminUpdateSubscriptionPlanSchema.body>;
export type AdminUpdateSubscriberStatusInput = z.infer<typeof adminUpdateSubscriberStatusSchema.body>;
export type CreateStripeSubscriptionPaymentIntentInput = z.infer<typeof createStripeSubscriptionPaymentIntentSchema.body>;
export type VerifyStripeSubscriptionPaymentInput = z.infer<typeof verifyStripeSubscriptionPaymentSchema.body>;
