import * as SecureStore from 'expo-secure-store';
import { credentialStorage } from './credential-storage';

const key = 'chatapp.auth.v1';
const options = {
  keychainService: 'chatapp.authentication',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export const nativeCredentials = credentialStorage({
  get: () => SecureStore.getItemAsync(key, options),
  set: (value) => SecureStore.setItemAsync(key, value, options),
  remove: () => SecureStore.deleteItemAsync(key, options),
});
