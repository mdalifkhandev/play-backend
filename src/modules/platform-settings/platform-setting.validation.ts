import { z } from 'zod';

const languageSchema = z.object({
  code: z.string().trim().toLowerCase().min(2).max(12),
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
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

const adMobConfigSchema = z.object({
  androidAppId: z.string().trim().optional(),
  iosAppId: z.string().trim().optional(),
  androidNativeAdId: z.string().trim().optional(),
  iosNativeAdId: z.string().trim().optional(),
});

export const updatePlatformSettingsBodySchema = z
  .object({
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().trim().min(1).max(300).optional(),
    videosBetweenAds: z.coerce.number().int().min(1).max(100).optional(),
    payoutPerThousandViewsUsd: z.coerce.number().min(0).max(1000).optional(),
    creatorSharePercentage: z.coerce.number().int().min(0).max(100).optional(),
    platformSharePercentage: z.coerce.number().int().min(0).max(100).optional(),
    languages: z.array(languageSchema).min(1).max(50).optional(),
    featureFlags: featureFlagsSchema.partial().optional(),
    adMobConfig: adMobConfigSchema.optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.creatorSharePercentage !== undefined && data.platformSharePercentage !== undefined) {
        return data.creatorSharePercentage + data.platformSharePercentage === 100;
      }
      return true;
    },
    {
      message: 'Creator and Platform share percentages must sum to 100',
      path: ['platformSharePercentage'],
    },
  );

export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsBodySchema>;
