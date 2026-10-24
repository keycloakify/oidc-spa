import { inject } from '@angular/core';
import { RedirectCommand, Router, type Routes } from '@angular/router';
import { enforceLoginGuard, injectOidc } from './oidc';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  {
    path: 'todo-list',
    canActivate: [enforceLoginGuard],
    loadComponent: () => import('./pages/todo-list').then((m) => m.TodoList),
  },
  {
    path: 'todo-list-admin',
    canActivate: [
      async (route, state) => {
        const oidc = injectOidc();
        const router = inject(Router);

        await enforceLoginGuard(route, state);

        if (oidc.isUserLoggedIn && oidc.user().canSeeAdminNavigation) return true;

        alert('You need the admin role to view this page.');
        return new RedirectCommand(router.parseUrl('/'));
      },
    ],
    loadComponent: () => import('./pages/todo-list-admin').then((m) => m.TodoListAdmin),
  },
  {
    path: 'account',
    canActivate: [enforceLoginGuard],
    loadComponent: () => import('./pages/account').then((m) => m.Account),
  },
  { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound) },
];
