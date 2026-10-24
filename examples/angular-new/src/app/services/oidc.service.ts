import { HttpContextToken } from '@angular/common/http';
import { oidcSpa } from 'oidc-spa/angular';
import { decodeJwt } from 'oidc-spa/decode-jwt';
import { z } from 'zod';

// Shape the browser's user around what the UI needs to display.
export type User = {
  displayName: string;
  email: string | undefined;
  avatarImgUrl: string;
  canSeeAdminNavigation: boolean;
};

export const { provideOidc, injectOidc, getOidc, createOidcInterceptor, enforceLoginGuard } =
  oidcSpa
    .withUser<User>(({ isMock, idTokenClaims, accessToken }) => {
      if (isMock) {
        return {
          displayName: 'John Doe',
          email: 'john.doe@gmail.com',
          avatarImgUrl: 'userPictureFallback.svg',
          canSeeAdminNavigation: true,
        };
      }

      const { name, email, picture } = z
        .object({ name: z.string(), email: z.string().optional(), picture: z.string().optional() })
        .parse(idTokenClaims);
      const { roles } = z
        .object({ roles: z.array(z.string()).optional() })
        .parse(decodeJwt(accessToken));

      return {
        displayName: name,
        email,
        avatarImgUrl: picture || 'userPictureFallback.svg',
        canSeeAdminNavigation: roles?.includes('admin') ?? false,
      };
    })
    // .withAutoLogin()
    .createUtils();

// Requests explicitly opt in to authentication; public requests carry no access token.
export const REQUIRE_ACCESS_TOKEN = new HttpContextToken<boolean>(() => false);
