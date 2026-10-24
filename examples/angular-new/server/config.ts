import type { RuntimeConfigs } from 'oidc-spa/server';

// Only `client` is sent to the browser. Introspection credentials stay on the server.
export function getOidcRuntimeConfigs(): {
  client: Record<string, unknown>;
  server: RuntimeConfigs<{ sub: string; roles?: string[] }>;
} {
  switch (process.env['OIDC_PROVIDER']) {
    case 'mock':
      return {
        client: { mode: 'mock', isUserInitiallyLoggedIn: true },
        server: {
          mode: 'mock',
          accessTokenClaims_mock: { sub: 'mock-user-id', roles: ['admin'] },
        },
      };
    case 'Keycloak':
      return {
        client: {
          mode: 'real',
          issuerUri: process.env['KEYCLOAK_ISSUER_URI'],
          clientId: process.env['KEYCLOAK_CLIENT_ID'],
          debugLogs: true,
        },
        server: {
          mode: 'real',
          issuerUri: process.env['KEYCLOAK_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'offline JWT validation',
            expectedAudience: process.env['KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE']!,
          },
        },
      };
    case 'Keycloak2':
      return {
        client: {
          mode: 'real',
          issuerUri: process.env['KEYCLOAK2_ISSUER_URI'],
          clientId: process.env['KEYCLOAK2_CLIENT_ID'],
          debugLogs: true,
        },
        server: {
          mode: 'real',
          issuerUri: process.env['KEYCLOAK2_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'introspection endpoint',
            clientId: process.env['KEYCLOAK2_API_CLIENT_ID']!,
            clientSecret: process.env['KEYCLOAK2_API_CLIENT_SECRET']!,
          },
        },
      };
    case 'Auth0':
      return {
        client: {
          mode: 'real',
          issuerUri: process.env['AUTH0_ISSUER_URI'],
          clientId: process.env['AUTH0_CLIENT_ID'],
          authorizationParams: { audience: process.env['AUTH0_API_IDENTIFIER'] },
          idleSessionLifetimeInSeconds: Number(process.env['AUTH0_SSO_SESSION_IDLE_SECONDS']),
          // DPoP is only available for paying Auth0 customers.
          disableDPoP: true,
          debugLogs: true,
        },
        server: {
          mode: 'real',
          issuerUri: process.env['AUTH0_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'offline JWT validation',
            expectedAudience: process.env['AUTH0_API_IDENTIFIER']!,
          },
        },
      };
    case 'EntraID':
      return {
        client: {
          mode: 'real',
          issuerUri: process.env['ENTRA_ISSUER_URI'],
          clientId: process.env['ENTRA_CLIENT_ID'],
          scopes: ['profile', process.env['ENTRA_API_SCOPE']],
          debugLogs: true,
        },
        server: {
          mode: 'real',
          issuerUri: process.env['ENTRA_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'offline JWT validation',
            expectedAudience: process.env['ENTRA_API_CLIENT_ID']!,
          },
        },
      };
    default:
      throw new Error('Unknown OIDC_PROVIDER. Choose a provider in .env.');
  }
}
