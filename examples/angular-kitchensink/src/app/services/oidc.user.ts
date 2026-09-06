// See: https://docs.oidc-spa.dev/features/user

import type { CreateUser } from 'oidc-spa/angular';
import { decodeJwt } from 'oidc-spa/decode-jwt';
import { z } from 'zod';

// App-specific user model exposed by `oidc.$user()`.
// Shape it around the information the UI needs to render.
export type User = {
  displayName: string;
  canSeeAdminNavigation: boolean;
};

const DecodedIdToken = z.object({
  name: z.string(),
});

const DecodedAccessToken = z.object({
  resource_access: z
    .object({
      'realm-management': z.object({
        roles: z.array(z.string()),
      }),
    })
    .optional(),
});

export const createUser: CreateUser<User> = ({
  decodedIdToken: decodedIdToken_generic,
  accessToken,
}) => {
  const decodedIdToken = DecodedIdToken.parse(decodedIdToken_generic);
  const decodedAccessToken = DecodedAccessToken.parse(decodeJwt(accessToken));

  return {
    displayName: decodedIdToken.name,
    canSeeAdminNavigation:
      decodedAccessToken.resource_access?.['realm-management'].roles.includes('realm-admin') ??
      false,
  };
};

// App-level user returned when the mock implementation is enabled.
export const user_mock: User = {
  displayName: 'John Doe',
  canSeeAdminNavigation: true,
};
