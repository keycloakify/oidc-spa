import { oidcSpa } from 'oidc-spa/angular';

// App-specific user model exposed by `oidc.$user()`.
// Shape it around the information the UI needs to render.
export type User = {
  displayName: string;
};

export const { Oidc } = oidcSpa
  .withUser<User>({
    createUser: async ({ decodedIdToken }) => {
      const { name } = decodedIdToken;

      if (typeof name !== 'string') {
        throw new Error('The ID token must contain a name claim.');
      }

      const user: User = {
        displayName: name,
      };

      return user;
    },
    user_mock: {
      displayName: 'John Doe',
    },
  })
  // .withAutoLogin()
  // .withNonBlockingRendering()
  .createUtils();
