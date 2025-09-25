import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideOidcInitAwaiter } from '../oidc';

import { routes } from './app.routes';
import { todoApiInterceptor } from './services/todo.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([todoApiInterceptor])),
    provideRouter(routes),
    provideOidcInitAwaiter,
  ],
};
