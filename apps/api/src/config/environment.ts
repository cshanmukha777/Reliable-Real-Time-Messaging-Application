import { backendOriginSchema, environmentSchema } from '@chatapp/contracts';
import { z } from 'zod';

const databaseUrl = z
  .string()
  .trim()
  .regex(/^mongodb(?:\+srv)?:\/\/[^/\s?#]+\/[a-zA-Z0-9_-]+(?:\?[^\s#]*)?$/)
  .transform((uri) => {
    const [base, query] = uri.split('?', 2);
    const options = new URLSearchParams(query);
    for (const name of ['serverSelectionTimeoutMS', 'connectTimeoutMS']) {
      if (!options.has(name)) options.set(name, '2000');
    }
    return `${base}?${options}`;
  });

const envSchema = z.object({
  DATABASE_URL: databaseUrl,
  AUTH_SIGNING_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .refine((value) => new Set(value.toLowerCase()).size >= 8),
  AUTH_ISSUER: z.string().trim().min(1).max(200).default('chatapp-api'),
  HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
  PORT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .default(3000),
  NODE_ENV: environmentSchema.default('development'),
  CORS_ORIGINS: z.string().default(''),
});

export function loadEnvironment(values: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(values);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid API configuration: ${fields.join(', ')}`);
  }
  const { CORS_ORIGINS, ...environment } = result.data;
  const validateOrigin = backendOriginSchema(
    environment.NODE_ENV !== 'production',
  );
  const origins = CORS_ORIGINS.trim() === '' ? [] : CORS_ORIGINS.split(',');
  const corsOrigins = origins.map((value) => {
    const result = validateOrigin.safeParse(value);
    if (!result.success)
      throw new Error('Invalid API configuration: CORS_ORIGINS');
    return result.data;
  });
  return { ...environment, CORS_ORIGINS: [...new Set(corsOrigins)] };
}
export type ApiEnvironment = ReturnType<typeof loadEnvironment>;
