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

export type KidsModePinInput = z.infer<typeof kidsModePinSchema>;
export type UpdateKidsProfileInput = z.infer<typeof updateKidsProfileSchema>;
export type DiscoverUsersQuery = z.infer<typeof discoverUsersQuerySchema>;
export type UsernameProfileParams = z.infer<typeof usernameProfileParamsSchema>;
