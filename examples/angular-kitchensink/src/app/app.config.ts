import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import {
  provideOidc,
  injectOidc,
  createOidcInterceptor,
  REQUIRE_ACCESS_TOKEN,
  INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN,
} from './services/oidc.service';
import { firstValueFrom } from 'rxjs';

type RemoteOidcConfig = {
  useMock: boolean;
  issuerUri: string;
  clientId: string;
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(
      withInterceptors([
        createOidcInterceptor({
          shouldInjectAccessToken: (req) => {
            if (req.context.get(REQUIRE_ACCESS_TOKEN)) {
              return true;
            }

            if (req.context.get(INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN)) {
              return injectOidc().isUserLoggedIn;
            }

            return false;
          },
        }),
      ])
    ),
    provideRouter(routes),
    provideClientHydration(),
    provideOidc(async () => {
      const http = inject(HttpClient);
      // No auth context flag: configuration must load before authentication can start.
      const config = await firstValueFrom(http.get<RemoteOidcConfig>('/api/oidc-config'));

      if (config.useMock) {
        return {
          implementation: 'mock',
          isUserInitiallyLoggedIn: true,
        };
      }

      return {
        implementation: 'real',
        issuerUri: config.issuerUri,
        clientId: config.clientId,
        debugLogs: true,
      };
    }),
  ],
};
