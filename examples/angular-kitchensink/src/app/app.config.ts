import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import {
  Oidc,
  provideOidc,
  provideMockOidc,
  createBearerInterceptor,
  REQUIRE_ACCESS_TOKEN,
  INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN,
} from './services/oidc.service';
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
    provideHttpClient(
      withInterceptors([
        createBearerInterceptor({
          shouldInjectAccessToken: (req) => {
            const oidc = inject(Oidc);

            if (req.context.get(REQUIRE_ACCESS_TOKEN)) {
              return true;
            }

            if (req.context.get(INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN)) {
              return oidc.isUserLoggedIn;
            }

            return false;
          },
        }),
      ])
    ),
    provideRouter(routes),
    environment.useMockOidc
      ? provideMockOidc({
          isUserInitiallyLoggedIn: true,
        })
      : provideOidc(async () => {
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
