import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { todoApiInterceptor } from './services/todo.service';
import { Oidc } from './services/oidc.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

type RemoteOidcConfig = {
  issuerUri: string;
  clientId: string;
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([todoApiInterceptor])),
    provideRouter(routes),
    environment.useMockOidc
      ? Oidc.provideMock({
          isUserInitiallyLoggedIn: true,
        })
      : Oidc.provide(async () => {
          const http = inject(HttpClient);
          const config = await firstValueFrom(http.get<RemoteOidcConfig>('./oidc-config.json'));

          return {
            issuerUri: config.issuerUri,
            clientId: config.clientId,
            debugLogs: true,
          };
        }),
  ],
};
