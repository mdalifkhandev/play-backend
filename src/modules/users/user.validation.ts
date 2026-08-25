import { z } from 'zod';

const usernameSchema = z
  .string()
  .trim()
  .min(2, 'Username is required.')
  .max(40, 'Username is too long.')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username contains unsupported characters.');

export const kidsModePinSchema = z.object({
  pin: z.string().length(6, 'PIN must be exactly 6 digits').regex(/^\d{6}$/, 'PIN must contain only numbers'),
});

export const updateKidsProfileSchema = z.object({
  name: z.string().max(80).optional(),
  ageRange: z.string().max(20).optional(),
  dailyLimitMs: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const discoverUsersQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional().default(''),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  })
  .strict();

export const usernameProfileParamsSchema = z.object({ username: usernameSchema }).strict();

export const updatePreferredLanguageSchema = z
  .object({
    languageCode: z.string().trim().min(2, 'Language code is required.').max(12, 'Language code is too long.'),
  })
  .strict();

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid user id.');

export const adminListUsersQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional().default(''),
    status: z.enum(['all', 'active', 'banned', 'suspended', 'pending']).optional().default('all'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(8),
  })
  .strict();

export const adminUserParamsSchema = z.object({ userId: objectIdSchema }).strict();

export const adminUserActionBodySchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type KidsModePinInput = z.infer<typeof kidsModePinSchema>;
export type UpdateKidsProfileInput = z.infer<typeof updateKidsProfileSchema>;
export type DiscoverUsersQuery = z.infer<typeof discoverUsersQuerySchema>;
export type UsernameProfileParams = z.infer<typeof usernameProfileParamsSchema>;
export type UpdatePreferredLanguageInput = z.infer<typeof updatePreferredLanguageSchema>;
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;
export type AdminUserParams = z.infer<typeof adminUserParamsSchema>;
export type AdminUserActionInput = z.infer<typeof adminUserActionBodySchema>;
