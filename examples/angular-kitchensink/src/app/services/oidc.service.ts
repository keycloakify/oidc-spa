import { Injectable } from '@angular/core';
import { AbstractOidcService } from 'oidc-spa/angular';
import { z } from 'zod';
import { HttpContextToken } from '@angular/common/http';

export type DecodedIdToken = z.infer<typeof decodedIdTokenSchema>;

const decodedIdTokenSchema = z.object({
  iat: z.number(),
  name: z.string(),
  realm_access: z
    .object({
      roles: z.array(z.string()),
    })
    .optional(),
});

const mockDecodedIdToken: DecodedIdToken = {
  iat: Math.floor(Date.now() / 1000),
  name: 'John',
  realm_access: {
    roles: ['admin'],
  },
};

@Injectable({ providedIn: 'root' })
export class Oidc extends AbstractOidcService<DecodedIdToken> {
  override decodedIdTokenSchema = decodedIdTokenSchema;
  override mockDecodedIdToken = async () => mockDecodedIdToken;
  // See: https://docs.oidc-spa.dev/v/v10/features/auto-login#angular
  override autoLogin = false;
  // See: https://docs.oidc-spa.dev/v/v10/features/non-blocking-rendering#react-spas
  override providerAwaitsInitialization = false;
}

export const REQUIRE_ACCESS_TOKEN = new HttpContextToken<boolean>(() => false);
export const INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN = new HttpContextToken<boolean>(() => false);

// If you want to validate the shape of the token without Zod:
/*
export type DecodedIdToken = {
  iat: number;
  name: string;
};

const decodedIdTokenSchema = {
  parse: (o: Record<string, unknown>): DecodedIdToken=> {

    const { iat, name } = o;

    if( typeof iat !== "number" || typeof name !== "string" ){
      throw new Error("Missing claim or wrong claim");
    }

    return { iat, name };

  }
};
*/
