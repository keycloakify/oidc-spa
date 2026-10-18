import { oidcSpa, extractRequestAuthContext } from 'oidc-spa/server';
import { z } from 'zod';
import type { Request, Response } from 'express';

// Follows the Express guide: validate the token, then expose the application's user.
// https://docs.oidc-spa.dev/integration-guides/backend-token-validation/express.js
const { bootstrapAuth, validateAndGetAccessTokenClaims } = oidcSpa
  .withAccessTokenClaimsSchema(
    z.object({
      sub: z.string(),
      name: z.string(),
      email: z.string().optional(),
    })
  )
  .createUtils();

bootstrapAuth(
  process.env['OIDC_USE_MOCK'] === 'true'
    ? {
        mode: 'mock',
        accessTokenClaims_mock: {
          sub: 'mock-user',
          name: 'John Doe',
          email: 'john.doe@example.com',
        },
      }
    : {
        mode: 'real',
        issuerUri: process.env['OIDC_ISSUER_URI']!,
        accessTokenValidation: {
          method: 'offline JWT validation',
          expectedAudience: process.env['OIDC_ACCESS_TOKEN_EXPECTED_AUDIENCE']!,
        },
      }
);

export type User = {
  id: string;
  name: string;
  email: string | undefined;
};

export function isAnonymousRequest(req: Request) {
  const requestAuthContext = extractRequestAuthContext({
    request: req,
    trustProxy: true,
  });

  return requestAuthContext === undefined;
}

export async function getUser(params: { req: Request; res: Response }): Promise<User> {
  const { req, res } = params;

  const bail = (statusCode: 400 | 401 | 500 | 503) => {
    res.sendStatus(statusCode);
    return new Promise<never>(() => {});
  };

  const requestAuthContext = extractRequestAuthContext({
    request: req,
    trustProxy: true,
  });

  if (requestAuthContext === undefined) {
    return bail(401);
  }

  if (!requestAuthContext.isWellFormed) {
    console.warn(requestAuthContext.debugErrorMessage);
    return bail(400);
  }

  const result = await validateAndGetAccessTokenClaims(requestAuthContext.accessTokenAndMetadata);

  if (!result.isSuccess) {
    console.warn(result.debugErrorMessage);
    return bail(result.recommendedHttpErrorStatusCode);
  }

  const { sub, name, email } = result.accessTokenClaims;
  return { id: sub, name, email };
}
