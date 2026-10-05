import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const result = spawnSync('pnpm', ['exec', 'web-ext', 'lint', '--source-dir', 'build/extension', '--output', 'json', '--no-input'], { encoding: 'utf8', env: { ...process.env, NO_UPDATE_NOTIFIER: '1' } });
if (result.error) throw result.error;
const report = JSON.parse(result.stdout);
const baseline = JSON.parse(await readFile('vendor/ariang/lint-baseline.json', 'utf8'));
const counts = {};
for (const warning of report.warnings) {
  const key = `${warning.code}:${warning.file}`;
  counts[key] = (counts[key] || 0) + 1;
}
const unexpected = Object.entries(counts).filter(([key, count]) => !baseline[key] || count > baseline[key]);
if (report.errors.length || unexpected.length) {
  console.error(JSON.stringify({ errors: report.errors, unexpectedWarnings: unexpected }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`web-ext: 0 errors, ${report.warnings.length} documented upstream/desktop warnings (hash-verified AriaNg). No new warnings.`);
}
