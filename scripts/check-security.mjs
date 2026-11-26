import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const apiExample =
  'DATABASE_URL=mongodb://127.0.0.1:27017/chatapp_dev?replicaSet=chatapp-rs&directConnection=true\nHOST=127.0.0.1\nPORT=3000\nNODE_ENV=development\nCORS_ORIGINS=\nAUTH_SIGNING_KEY=\nAUTH_ISSUER=chatapp-api';
const mobileExample =
  'EXPO_PUBLIC_API_BASE_URL=https://api.example.com\nEXPO_PUBLIC_ALLOW_LOCAL_HTTP=false';

for (const [path, expected] of [
  ['.env.example', apiExample],
  ['apps/mobile/.env.example', mobileExample],
]) {
  assert.deepEqual(
    parseEnv(await readFile(path, 'utf8')),
    parseEnv(expected),
    `Unexpected template values in ${path}`,
  );
}

const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
}).split('\0');
for (const file of tracked) {
  assert.doesNotMatch(
    file,
    /(?:^|\/)\.env(?!(?:\.example)$)(?:$|\.)|\.(?:jks|p8|p12|key|mobileprovision)$/i,
  );
}

const previewPhoto = await readFile(
  'apps/mobile/src/previews/design-system/rain-window.jpg',
);

async function verifyOutput(directory) {
  let bundles = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      bundles += await verifyOutput(path);
    } else if (/\.jpe?g$/i.test(entry.name)) {
      assert.ok(
        !(await readFile(path)).equals(previewPhoto),
        `Preview photo found in ${path}`,
      );
    } else if (/\.(?:js|hbc|json|map)$/.test(entry.name)) {
      const emitted = await readFile(path, 'utf8');
      assert.ok(
        !/CHATAPP_SERVER_ONLY_CANARY|mongodb(?:\+srv)?:\/\/|DATABASE_URL|AUTH_SIGNING_KEY|CHATAPP_AUTH_KEY_CANARY|@prisma\/client|EXPO_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|DATABASE|PRISMA)/.test(
          emitted,
        ),
        `Server configuration found in ${path}`,
      );
      assert.ok(
        !/Sunday field notes|I saved you the seat|rain-window\.jpg/.test(
          emitted,
        ),
        `Design preview content found in ${path}`,
      );
      if (/\.(?:js|hbc)$/.test(entry.name)) bundles += 1;
    }
  }
  return bundles;
}

for (const target of ['android', 'ios']) {
  assert.ok(
    (await verifyOutput(`apps/mobile/dist/${target}`)) > 0,
    `Missing ${target} bundle`,
  );
}
console.log(
  'Environment templates, tracked paths, Android bundle and iOS bundle passed server configuration checks.',
);
