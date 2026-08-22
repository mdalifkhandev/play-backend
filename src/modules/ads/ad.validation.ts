import { z } from 'zod';

import {
  adAreaTypes,
  adAudienceTypes,
  adCampaignStatuses,
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

export type CreateAdCampaignInput = z.infer<typeof createAdCampaignBodySchema>;
export type ListAdsQuery = z.infer<typeof listMyAdsQuerySchema>;
export type AdFeedQuery = z.infer<typeof adFeedQuerySchema>;
export type AdminAdActionInput = z.infer<typeof adminAdActionBodySchema>;
