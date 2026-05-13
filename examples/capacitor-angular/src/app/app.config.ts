import { Capacitor } from '@capacitor/core';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { CapacitorNavigator, CapacitorPreferencesStorageAdapter } from 'oidc-spa/capacitor';
import { Oidc } from './services/oidc.service';

const isNativeApp = Capacitor.isNativePlatform();
const storage = isNativeApp ? new CapacitorPreferencesStorageAdapter() : undefined;
const navigator = new CapacitorNavigator();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(
      withInterceptors([
        Oidc.createBearerInterceptor({
          shouldInjectAccessToken: (req) =>
            /^(https:\/\/jsonplaceholder\.typicode\.com)(\/.*)?$/i.test(req.url),
        }),
      ])
    ),
    provideRouter(routes),
    Oidc.provide({
      issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
      clientId: 'example-angular',
      postLoginRedirectUrl: 'com-oidcspa-capacitor://auth-callback',
      debugLogs: true,
      onNavigatorWarning: (warning: unknown) => {
        console.warn('[NavigatorWarning]', warning);
      },
      navigator: navigator,
      storageAdapter: storage,
      tokenStorageAdapter: storage,
      isNativeApp,
    }),
  ],
};
