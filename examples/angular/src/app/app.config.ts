import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { BearerInterceptor } from './interceptors/bearer.interceptor';
import { Oidc } from './services/oidc.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([BearerInterceptor])),
    provideRouter(routes),
    Oidc.provide({
      issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
      clientId: 'example-angular',
      debugLogs: true,
    }),
  ],
};
