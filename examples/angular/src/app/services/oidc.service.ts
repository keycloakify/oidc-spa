import { Injectable } from '@angular/core';
import { Oidc } from 'oidc-spa/angular';
import { z } from 'zod';

export const decodedIdTokenSchema = z.object({
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
export class AppOidc extends Oidc<DecodedIdToken> {}
