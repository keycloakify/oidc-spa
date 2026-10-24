import type { Request } from 'express';
import { extractRequestAuthContext, oidcSpa, type RuntimeConfigs } from 'oidc-spa/server';
import { z } from 'zod';

// App level representation of a user for the API request handler.
// Shape it to be able to identify the user and it's authorizations.
export type User_server = { id: string; isAdmin: boolean };

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
  .withRuntimeConfigs(async (): Promise<RuntimeConfigs<AccessTokenClaims>> => {
    switch (process.env['OIDC_PROVIDER']) {
      case 'mock':
        return {
          mode: 'mock',
          accessTokenClaims_mock: { sub: 'mock-user-id', roles: ['admin'] },
        };
      case 'Keycloak':
        return {
          mode: 'real',
          issuerUri: process.env['KEYCLOAK_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'offline JWT validation',
            expectedAudience: process.env['KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE']!,
          },
        };
      case 'Keycloak2':
        return {
          mode: 'real',
          issuerUri: process.env['KEYCLOAK2_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'introspection endpoint',
            clientId: process.env['KEYCLOAK2_API_CLIENT_ID']!,
            clientSecret: process.env['KEYCLOAK2_API_CLIENT_SECRET']!,
          },
        };
      case 'Auth0':
        return {
          mode: 'real',
          issuerUri: process.env['AUTH0_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'offline JWT validation',
            expectedAudience: process.env['AUTH0_API_IDENTIFIER']!,
          },
        };
      case 'EntraID':
        return {
          mode: 'real',
          issuerUri: process.env['ENTRA_ISSUER_URI']!,
          accessTokenValidation: {
            method: 'offline JWT validation',
            expectedAudience: process.env['ENTRA_API_CLIENT_ID']!,
          },
        };
      default:
        throw new Error('Unknown OIDC_PROVIDER. Choose a provider in .env.');
    }
  })
  .createUtils();

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function getUser(req: Request): Promise<User_server> {
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
