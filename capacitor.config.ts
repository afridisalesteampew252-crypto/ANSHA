import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell for the public catalog PWA.
 * Loads the dedicated mobile frontend (or an override) in a WebView — does not bundle the Next.js build.
 *
 * Override at sync/open time:
 *   CAPACITOR_SERVER_URL=https://preview.example.com npx cap sync
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  'https://www.anshatradingco.com/mobile';

const config: CapacitorConfig = {
  appId: 'com.anshatrading.app',
  appName: 'ANSHA Trading',
  webDir: 'native/www',
  server: {
    url: serverUrl,
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert', 'banner', 'list'],
    },
  },
};

export default config;
