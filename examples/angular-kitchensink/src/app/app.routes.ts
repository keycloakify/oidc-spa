import { inject } from '@angular/core';
import { Router, Routes, RedirectCommand } from '@angular/router';
import { Public } from './pages/public';
import { Oidc, enforceLoginGuard } from './services/oidc.service';

export const routes: Routes = [
  { path: '', component: Public },
  {
    path: 'protected',
    loadComponent: () => import('./pages/protected').then((c) => c.Protected),
    canActivate: [enforceLoginGuard],
  },
  {
    path: 'admin-only',
    loadComponent: () => import('./pages/admin-only').then((c) => c.AdminOnly),
    canActivate: [
      async (route, state) => {
        const oidc = inject(Oidc);
        const router = inject(Router);

        await enforceLoginGuard(route, state);

        if (oidc.$user().canSeeAdminNavigation) {
          return true;
        }

        alert('Only Admins can access this page');

        return new RedirectCommand(router.parseUrl('/'));
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
