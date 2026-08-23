import { z } from 'zod';

export const updateMonetizationSettingsBodySchema = z
  .object({
    creatorSharePercent: z.coerce.number().int().min(0).max(100),
  })
  .strict();

export const updateCreatorRequirementSettingsBodySchema = z
  .object({
    profileEnabled: z.boolean(),
    followers: z.coerce.number().int().min(0).max(100_000_000),
    followersEnabled: z.boolean(),
    views: z.coerce.number().int().min(0).max(1_000_000_000),
    viewsEnabled: z.boolean(),
    watchTimeMinutes: z.coerce.number().int().min(0).max(100_000_000),
    watchTimeEnabled: z.boolean(),
    likes: z.coerce.number().int().min(0).max(1_000_000_000),
    likesEnabled: z.boolean(),
    accountAgeDays: z.coerce.number().int().min(0).max(3650),
    accountAgeEnabled: z.boolean(),
    reels: z.coerce.number().int().min(0).max(100_000),
    reelsEnabled: z.boolean(),
    reportLimit: z.coerce.number().int().min(0).max(1000),
    guidelinesEnabled: z.boolean(),
  })
  .strict();

export type UpdateMonetizationSettingsInput = z.infer<typeof updateMonetizationSettingsBodySchema>;
export type UpdateCreatorRequirementSettingsInput = z.infer<typeof updateCreatorRequirementSettingsBodySchema>;
