import { inject } from '@angular/core';
import { RedirectCommand, Router, type Routes } from '@angular/router';
import { injectOidc } from '../../oidc';

export const routes: Routes = [
  {
    path: 'todo-list',
    loadComponent: () => import('./todo-list').then((m) => m.TodoList),
  },
  {
    path: 'todo-list-admin',
    canActivate: [
      () => {
        const oidc = injectOidc({ assert: 'user logged in' });
        const router = inject(Router);

        if (!oidc.user().canSeeAdminNavigation) {
          alert('You need the admin role to view this page.');
          return new RedirectCommand(router.parseUrl('/'));
        }

        return true;
      },
    ],
    loadComponent: () => import('./todo-list-admin').then((m) => m.TodoListAdmin),
  },
  {
    path: 'account',
    loadComponent: () => import('./account').then((m) => m.Account),
  },
];
