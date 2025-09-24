import { Routes } from '@angular/router';
import { enforceLoginGuard } from '../oidc';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/public').then((c) => c.Public) },
  {
    path: 'protected',
    loadComponent: () => import('./pages/protected').then((c) => c.Protected),
    canActivate: [enforceLoginGuard],
  },
  { path: '**', redirectTo: '' },
];
