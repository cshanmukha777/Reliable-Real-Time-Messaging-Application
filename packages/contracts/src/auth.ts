import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u);
export const passwordSchema = z.string().min(12).max(128);
export const loginInputSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});
export const registerInputSchema = loginInputSchema.extend({
  displayName: displayNameSchema,
});
export const profileInputSchema = z.strictObject({
  displayName: displayNameSchema,
});

export const opaqueCredentialSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const refreshInputSchema = z.strictObject({
  refreshToken: opaqueCredentialSchema,
  operationId: opaqueCredentialSchema,
});
export const logoutInputSchema = z.strictObject({
  refreshToken: opaqueCredentialSchema,
});
export const accountSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/),
  email: emailSchema,
  displayName: displayNameSchema,
  createdAt: z.iso.datetime(),
  avatarUrl: z.url().nullable(),
});
export const sessionResponseSchema = z.object({
  user: accountSchema,
  accessToken: z.string().min(1).max(4096),
  accessExpiresAt: z.iso.datetime(),
  refreshToken: opaqueCredentialSchema,
});

export type Account = z.infer<typeof accountSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type RefreshInput = z.infer<typeof refreshInputSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
