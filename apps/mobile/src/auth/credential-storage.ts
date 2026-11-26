import { opaqueCredentialSchema } from '@chatapp/contracts';
import { z } from 'zod';

const storedSessionSchema = z.strictObject({
  origin: z.string().max(300),
  retired: z.literal(true).optional(),
  userId: z.string().regex(/^[a-f0-9]{24}$/),
  refreshToken: opaqueCredentialSchema,
  pendingOperation: opaqueCredentialSchema.optional(),
});
export type StoredSession = z.infer<typeof storedSessionSchema>;
export interface CredentialStorage {
  read(): Promise<StoredSession | null>;
  write(value: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export interface Keychain {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

export function credentialStorage(keychain: Keychain): CredentialStorage {
  return {
    async read() {
      const raw = await keychain.get();
      if (raw === null) return null;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = null;
      }
      const result = storedSessionSchema.safeParse(value);
      if (result.success) return result.data;
      await keychain.remove();
      return null;
    },
    write: async (value) =>
      keychain.set(JSON.stringify(storedSessionSchema.parse(value))),
    clear: () => keychain.remove(),
  };
}
