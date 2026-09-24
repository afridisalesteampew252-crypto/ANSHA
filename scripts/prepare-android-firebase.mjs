import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = resolve(projectRoot, 'firebase/google-services.json');
const destination = resolve(projectRoot, 'android/app/google-services.json');

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log(`Prepared Firebase Android config at ${destination}`);
