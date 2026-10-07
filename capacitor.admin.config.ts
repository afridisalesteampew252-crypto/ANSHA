import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Separate staff APK. It keeps the existing customer/catalog APK unchanged
 * and opens the existing role-protected ANSHA admin dashboard.
 *
 * Override with CAPACITOR_ADMIN_SERVER_URL for preview testing.
 */
const serverUrl =
  process.env.CAPACITOR_ADMIN_SERVER_URL?.trim() ||
  'https://www.anshatradingco.com/admin/dashboard';

const config: CapacitorConfig = {
  appId: 'com.anshatrading.admin',
  appName: 'ANSHA Admin',
  webDir: 'native/www',
  server: {
    url: serverUrl,
    cleartext: false,
    errorPath: 'index.html',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert', 'banner', 'list'],
    },
  },
};

export default config;
