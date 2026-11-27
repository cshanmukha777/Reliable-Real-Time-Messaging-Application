import { randomUUID } from 'expo-crypto';
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';
import { createStaging } from './staging';

export function accountFiles(digest: string) {
  if (!documentDirectory) throw new Error('Attachment staging is unavailable.');
  return createStaging(
    `${documentDirectory}chatapp-outbox/${digest}/`,
    {
      initialize: (root) => makeDirectoryAsync(root, { intermediates: true }),
      copy: (from, to) => copyAsync({ from, to }),
      move: (from, to) => moveAsync({ from, to }),
      remove: (path) => deleteAsync(path, { idempotent: true }),
      list: readDirectoryAsync,
      async info(path, checksum) {
        const info = await getInfoAsync(path, { md5: checksum });
        return info.exists
          ? {
              size: info.size,
              updatedAt: info.modificationTime * 1000,
              ...(info.md5 && { checksum: info.md5 }),
            }
          : null;
      },
    },
    randomUUID,
  );
}
