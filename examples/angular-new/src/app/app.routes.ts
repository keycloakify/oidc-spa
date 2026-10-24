import type { Routes } from '@angular/router';
import { enforceLoginGuard } from './oidc';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  {
    path: 'todo-list',
    canActivate: [enforceLoginGuard],
    loadComponent: () => import('./pages/todo-list').then((m) => m.TodoList),
  },
  {
    path: 'todo-list-admin',
    canActivate: [enforceLoginGuard],
    loadComponent: () => import('./pages/todo-list-admin').then((m) => m.TodoListAdmin),
  },
  {
    path: 'account',
    canActivate: [enforceLoginGuard],
    loadComponent: () => import('./pages/account').then((m) => m.Account),
  },
  { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFound) },
];
