import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { createKeycloakUtils, isKeycloak } from 'oidc-spa/keycloak';
import { injectOidc } from '../services/oidc.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
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
        <div class="actions">
          @if (oidc.isUserLoggedIn) {
          <a routerLink="/account" class="avatar" aria-label="Open your account">
            <img
              [src]="oidc.user().avatarImgUrl"
              [alt]="oidc.user().displayName + ' avatar'"
              width="32"
              height="32"
            />
          </a>
          <button type="button" (click)="oidc.logout({})">Logout</button>
          } @else {
          <button type="button" class="button-primary" (click)="login()">Login</button>
          @if (keycloakUtils) {
          <button type="button" (click)="login(true)">Register</button>
          } @if (oidc.initializationError) {
          <p role="alert">Authentication is unavailable. Please reload to try again.</p>
          } }
        </div>
      </div>
    </header>
  `,
})
export class AppHeader {
  readonly oidc = injectOidc();
  readonly keycloakUtils = isKeycloak({ issuerUri: this.oidc.issuerUri })
    ? createKeycloakUtils({ issuerUri: this.oidc.issuerUri })
    : undefined;

  login(register = false) {
    if (this.oidc.isUserLoggedIn) return;
    return this.oidc.login({
      transformAuthorizationUrl: register
        ? this.keycloakUtils?.transformAuthorizationUrl_register
        : undefined,
    });
  }
}
