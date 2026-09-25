import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = resolve(projectRoot, 'firebase/google-services-admin.json');
const destination = resolve(projectRoot, 'android/app/google-services.json');
const expectedPackage = 'com.anshatrading.admin';

let config;
try {
  config = JSON.parse(await readFile(source, 'utf8'));
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    throw new Error(
      'Missing firebase/google-services-admin.json. Register com.anshatrading.admin in Firebase and add its Android config file before building the admin APK.'
    );
  }
  throw new Error('firebase/google-services-admin.json must be valid JSON.');
}

const hasMatchingClient = (config.client || []).some(
  (client) => client.client_info?.android_client_info?.package_name === expectedPackage
);
if (!hasMatchingClient) {
  throw new Error(
    `Firebase config must contain an Android client for ${expectedPackage}.`
  );
}

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log(`Prepared Firebase config for ${expectedPackage} at ${destination}`);
