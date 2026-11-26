import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { injectOidc } from '../../oidc';
import { AuthButtonsLoggedIn } from './auth-buttons-logged-in';
import { AuthButtonsNotLoggedIn } from './auth-buttons-not-logged-in';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, AuthButtonsLoggedIn, AuthButtonsNotLoggedIn],
  template: `
    <header class="app-header">
      <div class="header-inner">
        <a routerLink="/" class="brand">My App</a>
        <nav aria-label="Main navigation">
          <a
            routerLink="/"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="{ exact: true }"
            >Home</a
          >
          <a routerLink="/todo-list" routerLinkActive="active" ariaCurrentWhenActive="page"
            >Todos</a
          >
          @if (oidc.isUserLoggedIn && oidc.user().canSeeAdminNavigation) {
          <a routerLink="/todo-list-admin" routerLinkActive="active" ariaCurrentWhenActive="page"
            >Admin</a
          >
          }
        </nav>
        @if (oidc.isOidcReady) { @if (oidc.isUserLoggedIn) {
        <div appAuthButtonsLoggedIn class="actions"></div>
        } @else {
        <div appAuthButtonsNotLoggedIn class="actions"></div>
        } }
      </div>
    </header>
  `,
})
export class AppHeader {
  readonly oidc = injectOidc();
}
