import type { Request } from 'express';
import { extractRequestAuthContext, oidcSpa } from 'oidc-spa/server';
import { z } from 'zod';
import { getOidcRuntimeConfigs } from './config';

// The backend user is independent of the browser's display profile.
export type User = { id: string; isAdmin: boolean };

const { validateAndGetAccessTokenClaims } = oidcSpa
  .withAccessTokenClaimsSchema(z.object({ sub: z.string(), roles: z.array(z.string()).optional() }))
  .withRuntimeConfigs(() => getOidcRuntimeConfigs().server)
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

export async function requireAdmin(req: Request) {
  const user = await getUser(req);
  if (!user.isAdmin) throw new HttpError(403, 'You need the admin role to perform this action.');
}
