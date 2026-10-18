import { HttpContextToken } from '@angular/common/http';
import { oidcSpa } from 'oidc-spa/angular';
import { z } from 'zod';
import { decodeJwt } from 'oidc-spa/decode-jwt';

// App-specific user model exposed by `oidc.user()`.
export type User = {
  displayName: string;
  canSeeAdminNavigation: boolean;
};

export const {
  provideOidc,
  injectOidc,
  // getOidc() returns the core client, including tokens and user subscriptions.
  getOidc,
  createOidcInterceptor,
  enforceLoginGuard,
} = oidcSpa
  .withUser<User>(({ isMock, idTokenClaims, accessToken }) => {
    if (isMock) {
      return { displayName: 'John Doe', canSeeAdminNavigation: true };
    }

    const { name } = z.object({ name: z.string() }).parse(idTokenClaims);
    const decodedAccessToken = z
      .object({
        resource_access: z
          .object({
            'realm-management': z.object({ roles: z.array(z.string()) }),
          })
          .optional(),
      })
      .parse(decodeJwt(accessToken));

    return {
      displayName: name,
      canSeeAdminNavigation:
        decodedAccessToken.resource_access?.['realm-management'].roles.includes('realm-admin') ??
        false,
    };
  })
  // .withAutoLogin()
  .withNonBlockingRendering()
  .createUtils();

export const REQUIRE_ACCESS_TOKEN = new HttpContextToken<boolean>(() => false);
export const INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN = new HttpContextToken<boolean>(() => false);
