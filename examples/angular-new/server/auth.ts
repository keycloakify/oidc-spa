import type { Request } from 'express';
import { extractRequestAuthContext, oidcSpa } from 'oidc-spa/server';
import { z } from 'zod';
import type { RuntimeConfigs as RuntimeConfigs_server } from 'oidc-spa/server';
import type { RuntimeConfigs as RuntimeConfigs_client } from 'oidc-spa/angular';

// App level representation of a user for the API request handler.
// Shape it to be able to identify the user and it's authorizations.
export type User = { id: string; isAdmin: boolean };

// You define what you expect to be the shape of the access token claims.
type AccessTokenClaims = {
  sub: string;
  roles?: string[];
};

const AccessTokenClaims = z.toZod<AccessTokenClaims>()(
  z.object({ sub: z.string(), roles: z.array(z.string()).optional() })
);

const { validateAndGetAccessTokenClaims } = oidcSpa
  .withAccessTokenClaimsSchema(AccessTokenClaims)
  .withRuntimeConfigs(async () => runtimeConfigs.server)
  .createUtils();

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function getUser(req: Request): Promise<User> {
  const context = extractRequestAuthContext({ request: req, trustProxy: true });

  if (context === undefined) throw new HttpError(401, 'Authentication required.');
  if (!context.isWellFormed) throw new HttpError(400, 'Malformed authentication headers.');

  const result = await validateAndGetAccessTokenClaims(context.accessTokenAndMetadata);

  if (!result.isSuccess) {
    console.warn(result.debugErrorMessage);
    throw new HttpError(result.recommendedHttpErrorStatusCode, 'Could not authenticate request.');
  }

  return {
    id: result.accessTokenClaims.sub,
    isAdmin: result.accessTokenClaims.roles?.includes('admin') ?? false,
  };
}

const runtimeConfigs = ((): {
  client: RuntimeConfigs_client;
  server: RuntimeConfigs_server<AccessTokenClaims>;
} => {
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
          issuerUri: process.env['KEYCLOAK_ISSUER_URI']!,
          clientId: process.env['KEYCLOAK_CLIENT_ID']!,
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
          issuerUri: process.env['KEYCLOAK2_ISSUER_URI']!,
          clientId: process.env['KEYCLOAK2_CLIENT_ID']!,
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
          issuerUri: process.env['AUTH0_ISSUER_URI']!,
          clientId: process.env['AUTH0_CLIENT_ID']!,
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
          issuerUri: process.env['ENTRA_ISSUER_URI']!,
          clientId: process.env['ENTRA_CLIENT_ID']!,
          scopes: ['profile', process.env['ENTRA_API_SCOPE']!],
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
})();

export const runtimeConfigs_client = runtimeConfigs.client;
