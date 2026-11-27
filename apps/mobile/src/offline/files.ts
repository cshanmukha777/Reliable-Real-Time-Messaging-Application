import { clientOperationIdSchema } from '@chatapp/contracts';
import { randomUUID } from 'expo-crypto';
import { copyAsync, deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync, moveAsync, readDirectoryAsync } from 'expo-file-system/legacy';
import type { PickedFile } from '../messaging/picker-input';
import type { Stage } from './store';

export function accountFiles(digest: string) {
  if (!documentDirectory) throw new Error('Attachment staging is unavailable.');
  const root = `${documentDirectory}chatapp-outbox/${digest}/`;
  const path = (id: string) => root + clientOperationIdSchema.parse(id);
  const initialize = () => makeDirectoryAsync(root, { intermediates: true });
  return {
    path,
    async stage(file: PickedFile): Promise<Stage> {
      await initialize();
      const id = randomUUID();
      const destination = path(id);
      const partial = destination + '.part';
      try {
        await copyAsync({ from: file.uri, to: partial });
        const info = await getInfoAsync(partial, { md5: true });
        if (!info.exists || info.size !== file.input.size || !info.md5) throw new Error('FILE_CHANGED');
        await moveAsync({ from: partial, to: destination });
        return { id, input: file.input, checksum: info.md5 };
      } finally {
        await deleteAsync(partial, { idempotent: true }).catch(() => undefined);
      }
    },
    async validate(file: Stage): Promise<PickedFile> {
      const uri = path(file.id);
      const info = await getInfoAsync(uri, { md5: true });
      if (!info.exists) throw new Error('FILE_MISSING');
      if (info.size !== file.input.size || info.md5 !== file.checksum) throw new Error('FILE_CHANGED');
      return { uri, input: file.input };
    },
    discard: (id: string) => deleteAsync(path(id), { idempotent: true }),
    async sweep(known: Set<string>, now = Date.now()) {
      await initialize();
      for (const name of await readDirectoryAsync(root)) {
        const id = name.replace(/\.part$/, '');
        if (!clientOperationIdSchema.safeParse(id).success || known.has(id)) continue;
        const info = await getInfoAsync(root + name);
        if (info.exists && now - info.modificationTime * 1000 > 86_400_000) {
          await deleteAsync(root + name, { idempotent: true });
        }
      }
    },
  };
}
