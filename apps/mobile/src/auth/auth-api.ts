import { retryDelay } from '../retry-after';
import { fetch } from 'expo/fetch';
import {
  API_VERSION,
  accountSchema,
  errorResponseSchema,
  sessionResponseSchema,
  type LoginInput,
  type ProfileInput,
  type RefreshInput,
  type RegisterInput,
} from '@chatapp/contracts';

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super('Authentication request failed.');
  }
}

export class AuthApi {
  constructor(private readonly origin: string) {}

  private async request(
    path: string,
    method: 'GET' | 'POST' | 'PATCH',
    body?: object,
    bearer?: string,
  ): Promise<unknown> {
    const url = `${this.origin}/${API_VERSION}/${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method,
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body && { 'Content-Type': 'application/json' }),
          ...(bearer && { Authorization: `Bearer ${bearer}` }),
        },
        ...(body && { body: JSON.stringify(body) }),
      }).catch(() => {
        throw new AuthApiError(0, 'TRANSPORT');
      });
      if (response.redirected || response.url !== url)
        throw new AuthApiError(0, 'UNEXPECTED_ORIGIN');
      if (response.status === 204) return null;
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = errorResponseSchema.safeParse(result);
        throw new AuthApiError(
          response.status,
          error.success ? error.data.code : 'REQUEST_FAILED',
          retryDelay(response.headers.get('Retry-After')),
        );
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async register(input: RegisterInput) {
    return sessionResponseSchema.parse(
      await this.request('auth/register', 'POST', input),
    );
  }
  async login(input: LoginInput) {
    return sessionResponseSchema.parse(
      await this.request('auth/login', 'POST', input),
    );
  }
  async refresh(input: RefreshInput) {
    return sessionResponseSchema.parse(
      await this.request('auth/refresh', 'POST', input),
    );
  }
  async me(access: string) {
    return accountSchema.parse(
      await this.request('auth/me', 'GET', undefined, access),
    );
  }
  async update(input: ProfileInput, access: string) {
    return accountSchema.parse(
      await this.request('users/me', 'PATCH', input, access),
    );
  }
  async logout(refreshToken: string) {
    await this.request('auth/logout', 'POST', { refreshToken });
  }
  async logoutAll(access: string) {
    await this.request('auth/logout-all', 'POST', undefined, access);
  }
}
