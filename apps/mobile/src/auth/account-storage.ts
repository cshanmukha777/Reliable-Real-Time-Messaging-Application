import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { openLocalDatabase } from '../sqlite';

import { accountScopeKey, type AccountScope } from './account-scope';

export async function openAccountStorage(scope: AccountScope) {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    accountScopeKey(scope),
  );
  return openLocalDatabase(`chatapp-account-${digest}.db`);
}
