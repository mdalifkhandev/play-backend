import { z } from 'zod';

import {
  adAreaTypes,
  adAudienceTypes,
  adCampaignStatuses,
  adCtaTypes,
  adPlacements,
} from './ad-campaign.model.js';

export const adIdParamsSchema = z
  .object({
    adId: z.string().length(24, 'Invalid ad identifier.'),
  })
  .strict();

export const createAdCampaignBodySchema = z
  .object({
    category: z.string().trim().min(1).max(80),
    days: z.coerce.number().int().min(1).max(365),
    budgetUsd: z.coerce.number().min(1).max(1_000_000),
    targetUsers: z.coerce.number().int().min(1).max(100_000_000),
    placement: z.enum(adPlacements).default('feed'),
    audienceType: z.enum(adAudienceTypes),
    areaType: z.enum(adAreaTypes),
    city: z.string().trim().min(1).max(120).optional(),
    country: z.string().trim().min(1).max(120).optional(),
    mediaAssetId: z.string().length(24).optional(),
    mediaKey: z.string().trim().min(1).max(500).optional(),
    mediaUrl: z.string().trim().url().max(1000).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    destinationUrl: z.string().trim().url().max(1000).optional(),
    ctaType: z.enum(adCtaTypes).default('none'),
    ctaLabel: z.string().trim().min(1).max(40).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ctaType === 'learn_more' && !data.destinationUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationUrl'],
        message: 'Destination URL is required for Learn more button.',
      });
    }
  })
  .strict();

export const listMyAdsQuerySchema = z
  .object({
    status: z.enum(adCampaignStatuses).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().datetime().optional(),
  })
  .strict();

export const listAdminAdsQuerySchema = listMyAdsQuerySchema;

export const adFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(10).default(3),
  })
  .strict();

export const adminAdActionBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const verifyAdStripePaymentBodySchema = z
  .object({
    paymentIntentId: z.string().trim().min(1, 'Payment intent id is required.'),
  })
  .strict();

export const packageIdParamsSchema = z
  .object({
    packageId: z.string().length(24, 'Invalid package identifier.'),
  })
  .strict();

export const categoryIdParamsSchema = z
  .object({
    categoryId: z.string().length(24, 'Invalid category identifier.'),
  })
  .strict();

export const createAdPackageBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    days: z.coerce.number().int().min(1).max(365),
    priceUsd: z.coerce.number().min(1).max(1_000_000),
    targetUsers: z.coerce.number().int().min(1).max(100_000_000),
    description: z.string().trim().max(500).optional(),
    isPopular: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();

export const updateAdPackageBodySchema = createAdPackageBodySchema.partial();

export const createAdCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    icon: z.string().trim().max(60).optional(),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();

export const updateAdCategoryBodySchema = createAdCategoryBodySchema.partial();

export type CreateAdCampaignInput = z.infer<typeof createAdCampaignBodySchema>;
export type ListAdsQuery = z.infer<typeof listMyAdsQuerySchema>;
export type AdFeedQuery = z.infer<typeof adFeedQuerySchema>;
export type AdminAdActionInput = z.infer<typeof adminAdActionBodySchema>;
export type VerifyAdStripePaymentInput = z.infer<typeof verifyAdStripePaymentBodySchema>;
export type CreateAdPackageInput = z.infer<typeof createAdPackageBodySchema>;
export type UpdateAdPackageInput = z.infer<typeof updateAdPackageBodySchema>;
export type CreateAdCategoryInput = z.infer<typeof createAdCategoryBodySchema>;
export type UpdateAdCategoryInput = z.infer<typeof updateAdCategoryBodySchema>;
