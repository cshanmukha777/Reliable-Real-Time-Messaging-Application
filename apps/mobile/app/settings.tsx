import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import type { Appearance } from '@chatapp/contracts';
import { ApiClient } from '../src/api-client';
import { mobileEnvironment } from '../src/configuration';
import { useFoundation } from '../src/foundation';
import { SettingsView } from '../src/settings/settings-view';
import {
  resetBackend,
  restorePersistenceProbe,
  runPersistenceProbe,
  saveAppearance,
  saveBackend,
} from '../src/preferences';

type Connection = {
  status: 'idle' | 'connecting' | 'connected' | 'failed';
  detail: string;
};

export default function Settings() {
  const {
    configuration,
    defaultUrl,
    ignoredStoredBackend,
    updateConfiguration,
  } = useFoundation();
  const [candidate, setCandidate] = useState(configuration.apiBaseUrl);
  const [connection, setConnection] = useState<Connection>({
    status: 'idle',
    detail: '',
  });
  const [verifiedOrigin, setVerifiedOrigin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [probeId, setProbeId] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState('');
  const [probeReady, setProbeReady] = useState(false);

  useEffect(() => {
    let active = true;
    restorePersistenceProbe().then(
      (id) => {
        if (!active) return;
        setProbeId(id);
        setProbeReady(true);
        if (id) setStorageStatus('Found the previously saved probe.');
      },
      () => {
        if (active)
          setStorageStatus('Could not read the previously saved probe.');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function testConnection() {
    const parsed = mobileEnvironment().origin.safeParse(candidate);
    setVerifiedOrigin(null);
    if (!parsed.success) {
      setConnection({
        status: 'failed',
        detail: parsed.error.issues[0]?.message ?? 'Invalid server URL.',
      });
      return;
    }
    setBusy(true);
    setConnection({ status: 'connecting', detail: 'Checking the server…' });
    try {
      const health = await new ApiClient(parsed.data).health();
      setVerifiedOrigin(parsed.data);
      setConnection({
        status: 'connected',
        detail: `Connected to ChatApp API ${health.apiVersion}.`,
      });
    } catch (error) {
      const detail =
        error instanceof Error && error.name !== 'AbortError'
          ? error.message
          : 'Connection timed out.';
      setConnection({ status: 'failed', detail });
    } finally {
      setBusy(false);
    }
  }

  async function applyBackend(origin: string, reset = false) {
    setBusy(true);
    try {
      if (reset) await resetBackend();
      else await saveBackend(origin);
      updateConfiguration({ apiBaseUrl: origin });
      setCandidate(origin);
      setVerifiedOrigin(null);
      setConnection({
        status: 'idle',
        detail: reset ? 'Restored the default server.' : 'Server saved.',
      });
    } catch {
      setConnection({
        status: 'failed',
        detail: 'The server preference could not be saved.',
      });
    } finally {
      setBusy(false);
    }
  }

  function confirmReset() {
    Alert.alert('Restore default server?', defaultUrl, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: () => {
          void applyBackend(defaultUrl, true);
        },
      },
    ]);
  }

  async function changeAppearance(appearance: Appearance) {
    setBusy(true);
    try {
      await saveAppearance(appearance);
      updateConfiguration({ appearance });
    } catch {
      setStorageStatus('The appearance preference could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function checkStorage() {
    setBusy(true);
    try {
      const id = await runPersistenceProbe(probeId);
      setProbeId(id);
      setStorageStatus(
        'Verified the record after closing and reopening SQLite.',
      );
    } catch {
      setStorageStatus('The SQLite persistence check failed.');
    } finally {
      setBusy(false);
    }
  }

  const indicator = {
    idle: 'untested',
    connecting: 'checking',
    connected: 'online',
    failed: 'unavailable',
  } as const;

  return (
    <SettingsView
      appearance={configuration.appearance}
      onAppearance={changeAppearance}
      activeOrigin={configuration.apiBaseUrl}
      candidate={candidate}
      onCandidate={(value) => {
        setCandidate(value);
        setVerifiedOrigin(null);
        setConnection({ status: 'idle', detail: '' });
      }}
      connection={indicator[connection.status]}
      connectionDetail={connection.detail}
      busy={busy}
      verified={verifiedOrigin !== null}
      notice={ignoredStoredBackend}
      onTest={testConnection}
      onSave={() => {
        if (verifiedOrigin) void applyBackend(verifiedOrigin);
      }}
      onReset={confirmReset}
      {...(probeId && { probeId })}
      storageNote={storageStatus}
      probeReady={probeReady}
      onProbe={checkStorage}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
