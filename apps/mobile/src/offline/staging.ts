import { clientOperationIdSchema } from '@chatapp/contracts';
import type { PickedFile } from '../messaging/picker-input.ts';
import type { Stage } from './store.ts';

export type StagingIO = {
  initialize: (directory: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
  move: (from: string, to: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  list: (directory: string) => Promise<string[]>;
  info: (
    path: string,
    checksum: boolean,
  ) => Promise<{ size: number; checksum?: string; updatedAt: number } | null>;
};

export function createStaging(root: string, io: StagingIO, uuid: () => string) {
  const path = (id: string) => root + clientOperationIdSchema.parse(id);
  return {
    path,
    async stage(file: PickedFile): Promise<Stage> {
      await io.initialize(root);
      const id = uuid();
      const destination = path(id);
      const partial = destination + '.part';
      try {
        await io.copy(file.uri, partial);
        const info = await io.info(partial, true);
        if (!info || info.size !== file.input.size || !info.checksum)
          throw new Error('FILE_CHANGED');
        await io.move(partial, destination);
        return { id, input: file.input, checksum: info.checksum };
      } finally {
        await io.remove(partial).catch(() => undefined);
      }
    },
    async validate(file: Stage): Promise<PickedFile> {
      const uri = path(file.id);
      const info = await io.info(uri, true);
      if (!info) throw new Error('FILE_MISSING');
      if (
        info.size !== file.input.size ||
        !info.checksum ||
        info.checksum !== file.checksum
      )
        throw new Error('FILE_CHANGED');
      return { uri, input: file.input };
    },
    discard: (id: string) => io.remove(path(id)),
    async sweep(known: Set<string>, now = Date.now()) {
      await io.initialize(root);
      for (const name of await io.list(root)) {
        const id = name.replace(/\.part$/, '');
        if (!clientOperationIdSchema.safeParse(id).success || known.has(id))
          continue;
        const info = await io.info(root + name, false);
        if (info && now - info.updatedAt > 86_400_000)
          await io.remove(root + name);
      }
    },
  };
}
