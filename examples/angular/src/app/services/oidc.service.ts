import { Injectable } from '@angular/core';
import { AbstractOidcService } from 'oidc-spa/angular';
import { z } from 'zod';

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
  override autoLogin = false;
  override providerAwaitsInitialization = true;
}
