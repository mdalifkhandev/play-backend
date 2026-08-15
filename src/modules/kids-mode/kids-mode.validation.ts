import { z } from 'zod';

import { KidsAgeGroup } from './kids-mode.model.js';

const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must contain exactly 6 digits.');

export const setupKidsModeBodySchema = z
  .object({
    pin: pinSchema,
    confirmPin: pinSchema,
    currentPin: pinSchema.optional(),
    childNickname: z.string().trim().min(1).max(40).optional(),
    ageGroup: z.enum(KidsAgeGroup),
    dailyLimitMinutes: z.number().int().min(1).max(1_440),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pin !== value.confirmPin) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPin'],
        message: 'PIN confirmation does not match.',
      });
    }
  });

export const verifyKidsPinBodySchema = z.object({ pin: pinSchema }).strict();

export type SetupKidsModeInput = z.infer<typeof setupKidsModeBodySchema>;
export type VerifyKidsPinInput = z.infer<typeof verifyKidsPinBodySchema>;
