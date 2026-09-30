import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oidcspa.capacitor',
  appName: 'oidc-spa-capacitor',
  webDir: 'dist/capacitor-angular/browser',
  server: {
    androidScheme: 'https',
    hostname: 'com.oidcspa.capacitor',
  },
  plugins: {
    Browser: {},
    App: {},
    Preferences: {},
  },
};

export default config;
