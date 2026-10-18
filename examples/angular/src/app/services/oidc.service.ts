import { oidcSpa } from 'oidc-spa/angular';

// App-specific user model exposed by `oidc.user()`.
export type User = {
  displayName: string;
};

export const {
  provideOidc,
  injectOidc,
  // getOidc() returns the core client, including tokens and user subscriptions.
  getOidc,
  createOidcInterceptor,
  enforceLoginGuard,
} = oidcSpa
  .withUser<User>(({ isMock, idTokenClaims }) => {
    if (isMock) {
      return { displayName: 'John Doe' };
    }

    const { name } = idTokenClaims;
    if (typeof name !== 'string') {
      throw new Error('The ID token must contain a name claim.');
    }

    return { displayName: name };
  })
  // .withAutoLogin()
  .createUtils();
