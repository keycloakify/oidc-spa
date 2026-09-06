import { HttpContextToken } from '@angular/common/http';
import { oidcSpa } from 'oidc-spa/angular';
import { createUser, user_mock, type User } from './oidc.user';

export const { Oidc, provideOidc, provideMockOidc, createBearerInterceptor, enforceLoginGuard } =
  oidcSpa
    .withUser<User>({ createUser, user_mock })
    // See: https://docs.oidc-spa.dev/v/v10/features/auto-login#angular
    //.withAutoLogin()
    // See: https://docs.oidc-spa.dev/v/v10/features/non-blocking-rendering#angular
    .withNonBlockingRendering()
    .createUtils();

export const REQUIRE_ACCESS_TOKEN = new HttpContextToken<boolean>(() => false);
export const INCLUDE_ACCESS_TOKEN_IF_LOGGED_IN = new HttpContextToken<boolean>(() => false);
