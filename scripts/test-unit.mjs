import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tests = readdirSync('scripts').filter((name) => /^test-.*\.mjs$/.test(name) && name !== 'test-unit.mjs').sort();
if (!tests.length) throw new Error('No unit regression scripts found.');
for (const name of tests) {
  const result = spawnSync(process.execPath, [`scripts/${name}`], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${tests.length} unit regression scripts passed.`);
