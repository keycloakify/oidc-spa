import type { Routes } from '@angular/router';
import { enforceLoginGuard } from './oidc';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home').then((m) => m.Home),
  },
  {
    path: 'inactivity-logout',
    loadComponent: () => import('./pages/inactivity-logout').then((m) => m.InactivityLogout),
  },
  {
    path: '',
    canActivateChild: [enforceLoginGuard],
    loadComponent: () =>
      import('./pages/protected/protected-layout').then((m) => m.ProtectedLayout),
    loadChildren: () => import('./pages/protected/protected.routes').then((m) => m.routes),
  },
  { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound) },
];
