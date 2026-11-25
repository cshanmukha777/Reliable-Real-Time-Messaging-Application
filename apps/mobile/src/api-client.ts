import {
  API_VERSION,
  healthResponseSchema,
  type HealthResponse,
} from '@chatapp/contracts';

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async health(): Promise<HealthResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const expectedUrl = `${this.baseUrl}/${API_VERSION}/health`;
    try {
      const response = await fetch(expectedUrl, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (response.redirected || response.url !== expectedUrl) {
        throw new Error('The health endpoint redirected to a different URL.');
      }
      if (!response.ok)
        throw new Error(`The server returned HTTP ${response.status}.`);
      const parsed = healthResponseSchema.safeParse(await response.json());
      if (
        !parsed.success ||
        parsed.data.check !== 'service' ||
        parsed.data.status !== 'ok'
      ) {
        throw new Error(
          'This server did not return a compatible ChatApp health response.',
        );
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }
}
