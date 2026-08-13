import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/\d/, 'Password must contain a number.');

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit verification code.');

const resetTokenSchema = z.string().trim().min(40, 'Reset token is invalid.');

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(emptyStringToUndefined, z.string().trim().max(maxLength).optional());

const usernameSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(30, 'Username must be at most 30 characters.')
    .regex(/^@?[a-zA-Z0-9._]+$/, 'Username can only contain letters, numbers, dot and underscore.')
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .optional(),
);

const phoneNumberSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s()-]/g, ''))
    .refine(
      (value) => /^\+[1-9]\d{7,14}$/.test(value),
      'Enter a valid phone number in international format, for example +8801712345678.',
    )
    .optional(),
);

const dateOfBirthSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must use YYYY-MM-DD format.')
    .refine((value) => isValidCalendarDate(value), 'Enter a valid date of birth.')
    .refine((value) => value >= '1900-01-01', 'Date of birth must be on or after 1900-01-01.')
    .refine((value) => value <= currentUtcDate(), 'Date of birth cannot be in the future.')
    .optional(),
);

export const signUpBodySchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      error: 'You must accept terms and conditions.',
    }),
    legalConsents: z
      .object({
        termsConditionsVersion: z.coerce.number().int().min(1),
        privacyPolicyVersion: z.coerce.number().int().min(1),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Confirm password does not match.',
      });
    }
  });

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean().optional().default(false),
});

export const googleLoginBodySchema = z
  .object({
    idToken: z.string().trim().min(20, 'Google ID token is required.'),
    rememberMe: z.boolean().optional().default(true),
  })
  .strict();

export const emailBodySchema = z.object({
  email: emailSchema,
});

export const verifyCodeBodySchema = z.object({
  email: emailSchema,
  code: codeSchema,
});

export const resetPasswordBodySchema = z
  .object({
    resetToken: resetTokenSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      error: 'You must accept terms and conditions.',
    }),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Confirm password does not match.',
      });
    }
  });

export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token is required.').optional(),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
});

export const setupProfileBodySchema = z.object({
  username: usernameSchema,
  displayName: optionalTrimmedString(80),
  phoneNumber: phoneNumberSchema,
  dateOfBirth: dateOfBirthSchema,
  bio: optionalTrimmedString(500),
  instagram: optionalTrimmedString(120),
  youtube: optionalTrimmedString(250),
  photoUrl: optionalTrimmedString(500),
  photoPublicId: optionalTrimmedString(200),
});

export type SignUpInput = z.infer<typeof signUpBodySchema>;
export type LoginInput = z.infer<typeof loginBodySchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginBodySchema>;
export type EmailInput = z.infer<typeof emailBodySchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeBodySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordBodySchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenBodySchema>;
export type LogoutInput = z.infer<typeof logoutBodySchema>;
export type SetupProfileInput = z.infer<typeof setupProfileBodySchema>;

function isValidCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
