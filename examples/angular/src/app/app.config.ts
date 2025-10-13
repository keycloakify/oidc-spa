import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { todoApiInterceptor } from './services/todo.service';
import { Oidc } from './services/oidc.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([todoApiInterceptor])),
    provideRouter(routes),
    Oidc.provide({
      issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
      clientId: 'example-angular',
      debugLogs: true,
    }),
  ],
};
