import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const config = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const mobile = new URL('../apps/mobile/', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('package.json', mobile), 'utf8'),
);
assert.equal(manifest.main, 'expo-router/entry');
assert.ok(config.plugins.includes('expo-router'));
assert.ok(config.experiments.typedRoutes);
assert.deepEqual(config.platforms.toSorted(), ['android', 'ios', 'web']);
for (const route of ['_layout', 'index', 'settings']) {
  await access(new URL(`app/${route}.tsx`, mobile));
}
console.log('Expo Router configuration and entry routes are present.');
