import { inject } from '@angular/core';
import { Router, Routes, RedirectCommand, type CanActivateFn } from '@angular/router';
import { Oidc } from './services/oidc.service';

const adminOnlyGuard: CanActivateFn = async (route) => {
  const loginResult = await Oidc.enforceLoginGuard()(route);

  if (loginResult !== true) {
    return loginResult;
  }

  const oidc = inject(Oidc);
  const router = inject(Router);

  const roles = oidc.$decodedIdToken().realm_access?.roles ?? [];

  if (roles.includes('admin')) {
    return true;
  }

  alert('Only Admins can access this page');

  return new RedirectCommand(router.parseUrl('/'));
};

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
    canActivate: [adminOnlyGuard],
  },
  { path: '**', redirectTo: '' },
];
