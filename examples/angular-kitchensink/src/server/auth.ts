import { oidcSpa, extractRequestAuthContext } from 'oidc-spa/server';
import { z } from 'zod';
import type { Request, Response } from 'express';

// Follows the Express guide: validate the token, then expose the application's user.
// https://docs.oidc-spa.dev/integration-guides/backend-token-validation/express.js
const { bootstrapAuth, validateAndDecodeAccessToken } = oidcSpa
  .withExpectedDecodedAccessTokenShape({
    decodedAccessTokenSchema: z.object({
      sub: z.string(),
      name: z.string(),
      email: z.string().optional(),
    }),
  })
  .createUtils();

export { bootstrapAuth };

export type User = {
  id: string;
  name: string;
  email: string | undefined;
};

export function getUser(params: {
  req: Request;
  res: Response;
  allowAnonymous: true;
}): Promise<User | undefined>;
export function getUser(params: {
  req: Request;
  res: Response;
  allowAnonymous?: false;
}): Promise<User>;
export async function getUser(params: {
  req: Request;
  res: Response;
  allowAnonymous?: boolean;
}): Promise<User | undefined> {
  const { req, res, allowAnonymous = false } = params;

  const bail = (statusCode: 400 | 401) => {
    res.sendStatus(statusCode);
    return new Promise<never>(() => {});
  };

  const requestAuthContext = extractRequestAuthContext({
    request: req,
    // Express's trusted-proxy setting is configured in server.ts.
    //trustProxy: req.app.get('trust proxy') === true,
    trustProxy: true,
  });

  if (!requestAuthContext) {
    return allowAnonymous ? undefined : bail(401);
  }

  if (!requestAuthContext.isWellFormed) {
    console.warn(requestAuthContext.debugErrorMessage);
    return bail(400);
  }

  const { isSuccess, debugErrorMessage, decodedAccessToken } = await validateAndDecodeAccessToken(
    requestAuthContext.accessTokenAndMetadata
  );

  if (!isSuccess) {
    console.warn(debugErrorMessage);
    return bail(401);
  }

  const { sub, name, email } = decodedAccessToken;
  return { id: sub, name, email };
}
