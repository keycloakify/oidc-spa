import { HttpContextToken } from '@angular/common/http';
import { oidcSpa } from 'oidc-spa/angular';
import { z } from 'zod';
import { decodeJwt } from 'oidc-spa/decode-jwt';

// App-specific user model exposed by `oidc.user()`.
// Shape it around the information the UI needs to render.
export type User = {
  displayName: string;
  canSeeAdminNavigation: boolean;
};

export const {
  provideOidc,
  injectOidc,
  // getOidc() asynchronously returns the imperative OIDC API for code outside
  // Angular's injection context, such as standalone functions or API clients.
  getOidc,
  createOidcInterceptor,
  enforceLoginGuard,
} = oidcSpa
  // See: https://docs.oidc-spa.dev/features/user
  .withUser<User>({
    createUser: async ({ decodedIdToken, accessToken }) => {
      const { name } = z
        .object({
          name: z.string(),
        })
        .parse(decodedIdToken);

      const decodedAccessToken = z
        .object({
          resource_access: z
            .object({
              'realm-management': z.object({
                roles: z.array(z.string()),
              }),
            })
            .optional(),
        })
        .parse(decodeJwt(accessToken));

      const user: User = {
        displayName: name,
        canSeeAdminNavigation:
          decodedAccessToken.resource_access?.['realm-management'].roles.includes('realm-admin') ??
          false,
      };

      return user;
    },
    user_mock: {
      displayName: 'John Doe',
      canSeeAdminNavigation: true,
    },
  })
  // See: https://docs.oidc-spa.dev/v/v10/features/auto-login#angular
  //.withAutoLogin()
  // See: https://docs.oidc-spa.dev/v/v10/features/non-blocking-rendering#angular
  .withNonBlockingRendering()
  .createUtils();

export const REQUIRE_ACCESS_TOKEN = new HttpContextToken<boolean>(() => false);
export const INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN = new HttpContextToken<boolean>(() => false);
