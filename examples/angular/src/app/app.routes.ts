import { inject } from '@angular/core';
import { Router, Routes, RedirectCommand } from '@angular/router';
import { enforceLoginGuard, get$decodedIdToken } from '../oidc';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/public').then((c) => c.Public) },
  {
    path: 'protected',
    loadComponent: () => import('./pages/protected').then((c) => c.Protected),
    canActivate: [
      enforceLoginGuard,
      /*
      async () => {
        const decodedIdToken = get$decodedIdToken()();

        const router = inject(Router);

        if (!decodedIdToken.realm_access?.roles.includes('expected_role')) {
          return new RedirectCommand(router.parseUrl('/home?error=missing-role'));
        }

        return true;
      },
      */
    ],
  },
  { path: '**', redirectTo: '' },
];
