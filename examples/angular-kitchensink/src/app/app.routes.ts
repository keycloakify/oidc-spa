import { inject } from '@angular/core';
import { Router, Routes, RedirectCommand } from '@angular/router';
import { Oidc } from './services/oidc.service';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/public').then((c) => c.Public) },
  {
    path: 'protected',
    loadComponent: () => import('./pages/protected').then((c) => c.Protected),
    canActivate: [
      Oidc.enforceLoginGuard(),
      /*
      async () => {
        const oidc = inject(Oidc);
        const router = inject(Router);

        if( !oidc.$decodedIdToken().realm_access?.roles.includes('admin') ){
          return new RedirectCommand(router.parseUrl('/home?error=missing-admin-role'));
        }

        return true;
      },
      */
    ],
  },
  { path: '**', redirectTo: '' },
];
