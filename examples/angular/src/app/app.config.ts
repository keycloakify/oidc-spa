import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import type { RuntimeConfigs } from 'oidc-spa/angular';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { createOidcInterceptor, provideOidc, REQUIRE_ACCESS_TOKEN } from './oidc';

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
    provideOidc(async (): Promise<RuntimeConfigs> => {
      const http = inject(HttpClient);
      const env = await firstValueFrom(http.get<Record<string, string>>('/api/oidc-client-env'));

      switch (env['OIDC_PROVIDER']) {
        case 'mock':
          return {
            mode: 'mock',
            isUserInitiallyLoggedIn: true,
          };
        case 'Keycloak':
          return {
            mode: 'real',
            issuerUri: env['KEYCLOAK_ISSUER_URI'],
            clientId: env['KEYCLOAK_CLIENT_ID'],
            debugLogs: true,
          };
        case 'Keycloak2':
          return {
            mode: 'real',
            issuerUri: env['KEYCLOAK2_ISSUER_URI'],
            clientId: env['KEYCLOAK2_CLIENT_ID'],
            debugLogs: true,
          };
        case 'Auth0':
          return {
            mode: 'real',
            issuerUri: env['AUTH0_ISSUER_URI'],
            clientId: env['AUTH0_CLIENT_ID'],
            authorizationParams: {
              audience: env['AUTH0_API_IDENTIFIER'],
            },
            idleSessionLifetimeInSeconds: parseInt(env['AUTH0_SSO_SESSION_IDLE_SECONDS']),
            // DPoP is only available for paying Auth0 customer.
            disableDPoP: true,
            debugLogs: true,
          };
        case 'EntraID':
          return {
            mode: 'real',
            issuerUri: env['ENTRA_ISSUER_URI'],
            clientId: env['ENTRA_CLIENT_ID'],
            scopes: ['profile', env['ENTRA_API_SCOPE']],
            debugLogs: true,
          };
        default:
          throw new Error('Unknown provider');
      }
    }),
  ],
};
