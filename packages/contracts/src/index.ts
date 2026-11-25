import { z } from 'zod';

export const API_VERSION = 'v1';
export const API_SERVICE = 'chatapp-api';

export const environmentSchema = z.enum(['development', 'test', 'production']);
export const healthResponseSchema = z.object({
  service: z.literal(API_SERVICE),
  apiVersion: z.literal(API_VERSION),
  environment: environmentSchema,
  status: z.enum(['ok', 'unavailable']),
  check: z.enum(['service', 'live', 'ready']),
  database: z.enum(['available', 'unavailable']).optional(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const errorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.uuid(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const identifierSchema = z.string().regex(/^[a-f0-9]{24}$/i);
export type Identifier = z.infer<typeof identifierSchema>;
export const paginationSchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const appearanceSchema = z.enum(['system', 'light', 'dark']);
export type Appearance = z.infer<typeof appearanceSchema>;

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    (/^(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(hostname) &&
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname))
  );
}

function parseOrigin(
  value: string,
  allowLocalHttp: boolean,
): string | undefined {
  const match = /^(https?):\/\/([^/?#]+)\/?$/i.exec(value);
  const authority = match?.[2];
  if (!authority || /[\s\\%@]/.test(authority)) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (url.port === '0' || authority.endsWith(':')) return undefined;
  const hostname = url.hostname;
  const rawHostname = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':')[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && rawHostname !== hostname) {
    return undefined;
  }
  const labels = hostname.replace(/\.$/, '').split('.');
  const validHost =
    hostname.startsWith('[') ||
    (hostname.length <= 254 &&
      labels.every((label) =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
      ));
  if (!validHost) return undefined;
  if (url.protocol === 'https:' || (allowLocalHttp && isLocalHost(hostname))) {
    return url.origin;
  }
  return undefined;
}

export function backendOriginSchema(allowLocalHttp = false) {
  return z
    .string()
    .trim()
    .max(300)
    .transform((input, context) => {
      const origin = parseOrigin(input, allowLocalHttp);
      if (origin) return origin;
      context.addIssue({
        code: 'custom',
        message: allowLocalHttp
          ? 'Enter an HTTPS origin or a local development HTTP origin.'
          : 'Enter a server origin using HTTPS.',
      });
      return z.NEVER;
    });
}

export function configurationSchema(allowLocalHttp = false) {
  return z.object({
    apiBaseUrl: backendOriginSchema(allowLocalHttp),
    appearance: appearanceSchema,
  });
}
export type AppConfiguration = z.infer<ReturnType<typeof configurationSchema>>;
