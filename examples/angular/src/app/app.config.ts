import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { Oidc } from './services/oidc.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(
      withInterceptors([
        Oidc.createAccessTokenBearerInterceptor({
          shouldApply: (req) =>
            /^(https:\/\/jsonplaceholder\.typicode\.com)(\/.*)?$/i.test(req.url),
        }),
      ])
    ),
    provideRouter(routes),
    Oidc.provide({
      issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
      clientId: 'example-angular',
      debugLogs: true,
    }),
  ],
};
