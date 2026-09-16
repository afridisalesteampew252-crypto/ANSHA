import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync('lib/manufacturer-logos.ts', 'utf8');
const mappedAssets = [...source.matchAll(/:\s*'([^']+\.svg)'/g)].map((match) => match[1]);
const failures = [];

for (const asset of new Set(mappedAssets)) {
  const path = `public${asset}`;
  if (!existsSync(path)) {
    failures.push(`${asset}: missing file`);
    continue;
  }

  const contents = readFileSync(path, 'utf8').trim();
  if (!contents.startsWith('<svg') || !contents.endsWith('</svg>')) {
    failures.push(`${asset}: invalid SVG wrapper`);
  }
  if (!contents.includes('<title') && !contents.includes('aria-label=')) {
    failures.push(`${asset}: missing accessible name`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Verified ${new Set(mappedAssets).size} mapped brand assets.`);
