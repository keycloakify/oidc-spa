import type { CreateUser } from 'oidc-spa/angular';

export type User = {
  displayName: string;
  roles: string[];
};

export const createUser: CreateUser<User> = ({ decodedIdToken }) => {
  const { name, realm_access } = decodedIdToken;

  if (typeof name !== 'string') {
    throw new Error('The ID token must contain a name claim.');
  }

  const roles =
    typeof realm_access === 'object' && realm_access !== null && 'roles' in realm_access
      ? realm_access.roles
      : [];

  if (!Array.isArray(roles) || !roles.every((role): role is string => typeof role === 'string')) {
    throw new Error('The realm_access.roles claim must be an array of strings.');
  }

  return { displayName: name, roles };
};

export const user_mock: User = {
  displayName: 'John Doe',
  roles: ['admin'],
};
