import { randomUUID } from 'expo-crypto';
import { appearanceSchema, type Appearance } from '@chatapp/contracts';
import { mobileEnvironment } from './configuration';
import { openLocalDatabase } from './sqlite';
import { preferencesRepository, probeRepository } from './sqlite-core';

const databaseName = 'chatapp-settings.db';
const endpointKey = 'backend.origin';
const appearanceKey = 'appearance';

async function withDatabase<T>(
  operation: (db: Awaited<ReturnType<typeof openLocalDatabase>>) => Promise<T>,
) {
  const database = await openLocalDatabase(databaseName);
  try {
    return await operation(database);
  } finally {
    await database.close();
  }
}

export async function openPreferences() {
  const { origin, defaults } = mobileEnvironment();
  return withDatabase(async (db) => {
    const store = preferencesRepository(db);
    const saved = await store.get(endpointKey);
    const savedOrigin = origin.safeParse(saved);
    const savedAppearance = appearanceSchema.safeParse(
      await store.get(appearanceKey),
    );

    return {
      defaultUrl: defaults.apiBaseUrl,
      configuration: {
        apiBaseUrl: savedOrigin.success
          ? savedOrigin.data
          : defaults.apiBaseUrl,
        appearance: savedAppearance.success
          ? savedAppearance.data
          : defaults.appearance,
      },
      ignoredStoredBackend: saved !== null && !savedOrigin.success,
    };
  });
}

export function saveBackend(value: string) {
  const origin = mobileEnvironment().origin.parse(value);
  return withDatabase((db) =>
    preferencesRepository(db).set(endpointKey, origin),
  );
}

export function resetBackend() {
  return withDatabase((db) => preferencesRepository(db).remove(endpointKey));
}

export function saveAppearance(value: Appearance) {
  return withDatabase((db) =>
    preferencesRepository(db).set(appearanceKey, appearanceSchema.parse(value)),
  );
}

export async function runPersistenceProbe(previousId: string | null) {
  const id = randomUUID();
  await withDatabase(async (database) => {
    await database.transaction(async (tx) => {
      const store = probeRepository(tx);
      if (previousId) await store.remove(previousId);
      await store.create(id);
      await preferencesRepository(tx).set('probe.latest', id);
    });
  });
  if (!(await readPersistenceProbe(id)))
    throw new Error('Probe record could not be reopened.');
  return id;
}

async function readPersistenceProbe(id: string) {
  return withDatabase((database) => probeRepository(database).exists(id));
}

export function restorePersistenceProbe() {
  return withDatabase(async (database) => {
    const id = await preferencesRepository(database).get('probe.latest');
    if (!id || !(await probeRepository(database).exists(id))) return null;
    return id;
  });
}
