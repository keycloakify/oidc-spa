import { oidcSpa } from 'oidc-spa/angular';
import { createUser, user_mock, type User } from './oidc.user';

export const { Oidc } = oidcSpa
  .withUser<User>({ createUser, user_mock })
  // .withAutoLogin()
  // .withNonBlockingRendering()
  .createUtils();
