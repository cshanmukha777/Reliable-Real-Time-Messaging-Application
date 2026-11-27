import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const lock = JSON.parse(
  readFileSync(new URL('../package-lock.json', import.meta.url)),
);
const report = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  timeout: 90000,
});
if (report.error) throw report.error;
const audit = JSON.parse(report.stdout);
if (audit.error || !audit.vulnerabilities)
  throw new Error('Could not retrieve the npm audit report.');

const reviewed = new Map([
  ['GHSA-ggr8-5vv4-36mx', ['node_modules/deepmerge-ts', '7.1.5']],
  [
    'GHSA-g3hv-75wg-m249',
    ['node_modules/@expo/fingerprint/node_modules/minimatch', '10.2.6'],
  ],
]);

for (const { name, nodes, via } of Object.values(audit.vulnerabilities)) {
  // npm also reports ancestor packages. The originating advisories determine the gate.
  for (const advisory of via.filter((entry) => typeof entry !== 'string')) {
    const id = advisory.url.split('/').at(-1);
    const [path, version] = reviewed.get(id) ?? [];
    const known =
      nodes.length === 1 &&
      nodes.includes(path) &&
      lock.packages[path]?.version === version;
    console.log(
      `${known ? 'Reviewed' : 'Unreviewed'}: ${advisory.severity} ${id} in ${name} (${nodes.join(', ')})`,
    );
    if (!known && ['high', 'critical'].includes(advisory.severity))
      process.exitCode = 1;
  }
}
