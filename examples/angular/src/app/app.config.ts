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
        Oidc.createBearerInterceptor({
          shouldInjectAccessToken: (req) =>
            // NOTE: This is the legacy and familiar pattern but we do not recommend it.
            // Prefer using per request context token: https://github.com/keycloakify/oidc-spa/blob/c0f13614c59d38e111bf0af6f6b36c71b74018f1/examples/angular-kitchensink/src/app/app.config.ts#L30-L42
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
