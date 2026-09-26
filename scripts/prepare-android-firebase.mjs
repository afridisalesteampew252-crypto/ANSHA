import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = resolve(projectRoot, 'firebase/google-services.json');
const destination = resolve(projectRoot, 'android/app/google-services.json');
const launcherIconSource = resolve(projectRoot, 'resources/ansha-launcher-icon.png');
const manifestPath = resolve(projectRoot, 'android/app/src/main/AndroidManifest.xml');
const gradlePath = resolve(projectRoot, 'android/app/build.gradle');

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

const iconSizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

try {
  for (const density of Object.keys(iconSizes)) {
    const targetDir = resolve(projectRoot, `android/app/src/main/res/mipmap-${density}`);
    await mkdir(targetDir, { recursive: true });
    for (const filename of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      await copyFile(launcherIconSource, resolve(targetDir, filename));
    }
  }
  console.log('Applied ANSHA launcher icon to Android density resources.');
} catch (error) {
  if (error instanceof Error && !error.message.includes('ENOENT')) throw error;
  // The Android platform may not have been added yet; run this script again after cap add android.
}

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

try {
  const versionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE || '1', 10);
  const versionName = (process.env.ANDROID_VERSION_NAME || '1.0.0').trim();
  if (!Number.isInteger(versionCode) || versionCode < 1 || !versionName) {
    throw new Error('ANDROID_VERSION_CODE must be a positive integer and ANDROID_VERSION_NAME must be non-empty.');
  }
  const gradle = await readFile(gradlePath, 'utf8');
  const versioned = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${versionName.replaceAll('"', '')}"`);
  await writeFile(gradlePath, versioned);
  console.log(`Prepared Android version ${versionName} (${versionCode})`);
} catch (error) {
  if (error instanceof Error && !error.message.includes('ENOENT')) throw error;
  // Android may not have been generated yet; cap sync will create it later.
}

console.log(`Prepared Firebase Android config at ${destination}`);
