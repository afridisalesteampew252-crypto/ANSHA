import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = resolve(projectRoot, 'firebase/google-services.json');
const destination = resolve(projectRoot, 'android/app/google-services.json');
const manifestPath = resolve(projectRoot, 'android/app/src/main/AndroidManifest.xml');

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

try {
  const manifest = await readFile(manifestPath, 'utf8');
  const deepLink = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="ansha" android:host="auth" android:path="/callback" />
            </intent-filter>`;
  if (!manifest.includes('android:scheme="ansha"')) {
    const marker = '\n        </activity>';
    await writeFile(manifestPath, manifest.replace(marker, `${deepLink}${marker}`));
  }
} catch {
  // The Android platform may not have been added yet. cap add/sync will run later.
}

console.log(`Prepared Firebase Android config at ${destination}`);
