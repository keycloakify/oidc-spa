import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { DecodedIdToken, Oidc } from '../services/oidc.service';

export const AdminGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  return Oidc.createAuthGuard<DecodedIdToken>(({ oidc }) => {
    if (
      oidc.isUserLoggedIn &&
      (oidc.getDecodedIdToken().realm_access?.roles ?? []).includes('admin')
    ) {
      return true;
    }
    alert('Only Admins can access this page');

    return new RedirectCommand(router.parseUrl('/'));
  })(route, state);
};
