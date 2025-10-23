import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { BearerInterceptor } from './interceptors/bearer.interceptor';
import { Oidc } from './services/oidc.service';

type RemoteOidcConfig = {
  issuerUri: string;
  clientId: string;
};

const provideOidc = (useMockOidc: boolean) =>
  useMockOidc
    ? Oidc.provideMock({
        isUserInitiallyLoggedIn: true,
      })
    : Oidc.provide(async () => {
        // should be runned outside angular to prevent http interceptor request piping
        const config: RemoteOidcConfig = await fetch('/oidc-config.json').then((res) => res.json());

        return {
          issuerUri: config.issuerUri,
          clientId: config.clientId,
          debugLogs: true,
        };
      });

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([BearerInterceptor])),
    provideRouter(routes),
    provideOidc(environment.useMockOidc),
  ],
};
