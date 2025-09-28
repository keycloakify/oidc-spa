import { inject } from '@angular/core';
import { Router, Routes, RedirectCommand } from '@angular/router';
import { Oidc } from './services/oidc.service';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/public').then((c) => c.Public) },
  {
    path: 'protected',
    loadComponent: () => import('./pages/protected').then((c) => c.Protected),
    canActivate: [Oidc.enforceLoginGuard()],
  },
  {
    path: 'admin-only',
    loadComponent: () => import('./pages/admin-only').then((c) => c.AdminOnly),
    canActivate: [
      async (route) => {
        const oidc = inject(Oidc);
        const router = inject(Router);

        await Oidc.enforceLoginGuard()(route);

        if ((oidc.$decodedIdToken().realm_access?.roles ?? []).includes('admin')) {
          return true;
        }

        alert('Only Admins can access this page');

        return new RedirectCommand(router.parseUrl('/'));
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
