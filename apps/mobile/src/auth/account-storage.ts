import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { openLocalDatabase } from '../sqlite';

import { accountScopeKey, type AccountScope } from './account-scope';

export function accountStorageDigest(scope: AccountScope) {
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    accountScopeKey(scope),
  );
}

export async function openAccountStorage(scope: AccountScope) {
  const digest = await accountStorageDigest(scope);
  return openLocalDatabase(`chatapp-account-${digest}.db`, true);
}
