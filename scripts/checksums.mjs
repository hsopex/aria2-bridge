import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('dist')).filter(f => f.endsWith('.zip')).sort();
await writeFile('dist/SHA256SUMS', (await Promise.all(files.map(async f => `${createHash('sha256').update(await readFile(`dist/${f}`)).digest('hex')}  ${f}\n`))).join(''));
console.log('SHA256SUMS written; ZIP artifacts are unsigned.');
