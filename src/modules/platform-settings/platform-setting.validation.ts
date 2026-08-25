import { z } from 'zod';

const languageSchema = z.object({
  code: z.string().trim().toLowerCase().min(2).max(12),
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
});

const payoutRateSchema = z.object({
  region: z.string().trim().min(1).max(80),
  rateUsd: z.coerce.number().min(0).max(1000),
});

const featureFlagsSchema = z.object({
  liveStreaming: z.boolean(),
  ads: z.boolean(),
  kidsMode: z.boolean(),
  rewards: z.boolean(),
  subscriptions: z.boolean(),
  creatorApplications: z.boolean(),
  coinPurchase: z.boolean(),
  withdrawals: z.boolean(),
});

export const updatePlatformSettingsBodySchema = z
  .object({
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().trim().min(1).max(300).optional(),
    videosBetweenAds: z.coerce.number().int().min(1).max(100).optional(),
    payoutPerThousandViewsUsd: z.coerce.number().min(0).max(1000).optional(),
    payoutRates: z.array(payoutRateSchema).min(1).max(20).optional(),
    languages: z.array(languageSchema).min(1).max(50).optional(),
    featureFlags: featureFlagsSchema.partial().optional(),
  })
  .strict();

export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsBodySchema>;
