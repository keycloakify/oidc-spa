import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import {
  Oidc,
  REQUIRE_ACCESS_TOKEN,
  INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN,
} from './services/oidc.service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { BearerInterceptor } from './interceptors/bearer.interceptor';
import { provideOidc } from './oidc';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(
      withInterceptors([
        Oidc.createBearerInterceptor({
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
    provideOidc(environment.useMockOidc),
    provideClientHydration(withEventReplay()),
  ],
};
