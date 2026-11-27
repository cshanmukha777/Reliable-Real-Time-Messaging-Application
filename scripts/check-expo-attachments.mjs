import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(
  new URL('../apps/mobile/package.json', import.meta.url),
);
const { dependencies } = require('./package.json');
const bundled = require('expo/bundledNativeModules.json');

for (const name of [
  'expo-document-picker',
  'expo-file-system',
  'expo-image-picker',
  'expo-sharing',
]) {
  const { version } = require(`${name}/package.json`);
  assert.equal(
    version,
    dependencies[name],
    `${name} is not installed at its workspace pin`,
  );
  assert.equal(
    version,
    bundled[name].replace(/^~/, ''),
    `${name} differs from the installed SDK catalog`,
  );
}
console.log(
  'All four native attachment packages match the installed Expo SDK catalog.',
);
