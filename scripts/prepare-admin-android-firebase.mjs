import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
const gradlePath = resolve(projectRoot, 'android/app/build.gradle');
const versionCode = Number(process.env.ANDROID_VERSION_CODE || '5');
const versionName = (process.env.ANDROID_VERSION_NAME || '1.4').trim();
if (!Number.isSafeInteger(versionCode) || versionCode < 1 || !/^[0-9]+(?:\.[0-9]+){1,3}$/.test(versionName)) {
  throw new Error('Invalid Android version settings.');
}
const gradle = await readFile(gradlePath, 'utf8');
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]+"/.test(gradle)) throw new Error('Android version fields missing.');
await writeFile(gradlePath, gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`));
console.log(`Prepared Firebase config for ${expectedPackage} at ${destination}`);
