import { useMemo } from 'react';
import { fetch } from 'expo/fetch';
import { useSession } from '../auth/session-provider';
import { MessagingApi, MessagingError } from './api';

export function useMessaging() {
  const { manager, accountScope } = useSession();
  const api = useMemo(() => new MessagingApi(manager, (url, options) => fetch(url, options)), [manager]);
  return { api, accountScope };
}

export function requestMessage(error: unknown, fallback: string) {
  if (error instanceof MessagingError) {
    if ([401, 403, 404].includes(error.status)) return 'You no longer have access to this item.';
    if (error.status === 429) return 'Too many searches. Try again in a minute.';
    if (error.status === 409) return 'The request conflicts with a previous change. Refresh and try again.';
    if (error.status === 413) return 'This file exceeds the server upload limit.';
    if (error.status === 503) return 'This service is temporarily unavailable.';
  }
  return fallback;
}
