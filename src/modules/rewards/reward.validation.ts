import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid ID.');

export const updateRewardSettingsBodySchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(365),
  leaderboardLimit: z.coerce.number().int().min(1).max(100),
  viewsWeight: z.coerce.number().min(0).max(100),
  likesWeight: z.coerce.number().min(0).max(100),
  commentsWeight: z.coerce.number().min(0).max(100),
  sharesWeight: z.coerce.number().min(0).max(100),
  followersWeight: z.coerce.number().min(0).max(100),
  isActive: z.boolean().optional().default(true),
});

export const createRewardProgramBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  reward: z.string().trim().min(1).max(120),
  eligibilityCriteria: z.string().trim().min(2).max(300),
  cycle: z.enum(['weekly', 'monthly', 'yearly', 'custom']).optional().default('monthly'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

export const updateRewardProgramBodySchema = createRewardProgramBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required.',
);

export const rewardProgramIdParamSchema = z.object({
  programId: objectIdSchema,
});

export const finalizeRewardWinnersBodySchema = z.object({
  programId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cycleLabel: z.string().trim().min(2).max(60).optional(),
});

export const rewardWinnerIdParamSchema = z.object({
  winnerId: objectIdSchema,
});

export const updateRewardWinnerStatusBodySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'paid']),
});

export type UpdateRewardSettingsInput = z.infer<typeof updateRewardSettingsBodySchema>;
export type CreateRewardProgramInput = z.infer<typeof createRewardProgramBodySchema>;
export type UpdateRewardProgramInput = z.infer<typeof updateRewardProgramBodySchema>;
export type FinalizeRewardWinnersInput = z.infer<typeof finalizeRewardWinnersBodySchema>;
export type UpdateRewardWinnerStatusInput = z.infer<typeof updateRewardWinnerStatusBodySchema>;
