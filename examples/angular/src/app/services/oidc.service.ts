import { Injectable } from '@angular/core';
import { AbstractOidcService } from 'oidc-spa/angular';
import { z } from 'zod';

const decodedIdTokenSchema = z.object({
  iat: z.number(),
  name: z.string(),
  realm_access: z
    .object({
      roles: z.array(z.string()),
    })
    .optional(),
});

export type DecodedIdToken = z.infer<typeof decodedIdTokenSchema>;

@Injectable({ providedIn: 'root' })
export class Oidc extends AbstractOidcService<DecodedIdToken> {
  override decodedIdTokenSchema = decodedIdTokenSchema;
  override autoLogin = false;
  override providerAwaitsInitialization = true;
}
