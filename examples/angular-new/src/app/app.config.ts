import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import type { RuntimeConfigs } from 'oidc-spa/angular';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { createOidcInterceptor, provideOidc, REQUIRE_ACCESS_TOKEN } from './services/oidc.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
        createOidcInterceptor({
          shouldInjectAccessToken: (req) => req.context.get(REQUIRE_ACCESS_TOKEN),
        }),
      ])
    ),
    provideOidc(() => {
      const http = inject(HttpClient);
      return firstValueFrom(http.get<RuntimeConfigs>('/api/oidc-client-runtime-configs'));
    }),
  ],
};
