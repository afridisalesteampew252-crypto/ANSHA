import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = resolve(projectRoot, 'firebase/google-services-admin.json');
const destination = resolve(projectRoot, 'android/app/google-services.json');
const launcherIconSource = resolve(projectRoot, 'resources/ansha-launcher-icon.png');
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

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const targetDir = resolve(projectRoot, `android/app/src/main/res/mipmap-${density}`);
  await mkdir(targetDir, { recursive: true });
  for (const filename of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    await copyFile(launcherIconSource, resolve(targetDir, filename));
  }
}
console.log('Applied ANSHA launcher icon to the admin Android resources.');
console.log(`Prepared Firebase config for ${expectedPackage} at ${destination}`);
