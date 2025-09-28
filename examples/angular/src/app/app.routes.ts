import { Routes } from '@angular/router';
import { Oidc } from './services/oidc.service';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/public').then((c) => c.Public) },
  {
    path: 'protected',
    loadComponent: () => import('./pages/protected').then((c) => c.Protected),
    canActivate: [Oidc.enforceLoginGuard],
  },
  { path: '**', redirectTo: '' },
];
