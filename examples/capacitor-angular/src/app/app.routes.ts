import { Routes } from '@angular/router';
import { Oidc } from './services/oidc.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/public').then((m) => m.PublicComponent),
  },
  {
    path: 'protected',
    loadComponent: () => import('./pages/protected').then((m) => m.ProtectedComponent),
    canActivate: [Oidc.enforceLoginGuard],
  },
];
