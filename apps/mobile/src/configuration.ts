import 'react-native-url-polyfill/auto';
import { backendOriginSchema, type AppConfiguration } from '@chatapp/contracts';

export function mobileEnvironment() {
  const allowLocalHttp =
    __DEV__ && process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === 'true';
  const origin = backendOriginSchema(allowLocalHttp);
  const configured = origin.safeParse(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (!configured.success) {
    throw new Error(
      'Set EXPO_PUBLIC_API_BASE_URL to an origin allowed by this build.',
    );
  }
  const defaults: AppConfiguration = {
    apiBaseUrl: configured.data,
    appearance: 'system',
  };
  return { defaults, origin };
}
