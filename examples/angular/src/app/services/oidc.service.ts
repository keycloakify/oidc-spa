import { oidcSpa } from 'oidc-spa/angular';
import { createUser, user_mock, type User } from './oidc.user';

export const { Oidc, provideOidc, provideMockOidc, createBearerInterceptor, enforceLoginGuard } =
  oidcSpa
    .withUser<User>({ createUser, user_mock })
    // .withAutoLogin()
    // .withNonBlockingRendering()
    .createUtils();
