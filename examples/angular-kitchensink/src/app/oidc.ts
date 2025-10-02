import { EnvironmentProviders } from '@angular/core';
import { Oidc } from './services/oidc.service';

type RemoteOidcConfig = {
  issuerUri: string;
  clientId: string;
};

export const provideOidc = (useMockOidc: boolean): EnvironmentProviders =>
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
