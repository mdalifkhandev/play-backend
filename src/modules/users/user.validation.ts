import { z } from 'zod';

export const kidsModePinSchema = z.object({
  pin: z.string().length(6, 'PIN must be exactly 6 digits').regex(/^\d{6}$/, 'PIN must contain only numbers'),
});

export const updateKidsProfileSchema = z.object({
  name: z.string().max(80).optional(),
  ageRange: z.string().max(20).optional(),
  dailyLimitMs: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export type KidsModePinInput = z.infer<typeof kidsModePinSchema>;
export type UpdateKidsProfileInput = z.infer<typeof updateKidsProfileSchema>;
