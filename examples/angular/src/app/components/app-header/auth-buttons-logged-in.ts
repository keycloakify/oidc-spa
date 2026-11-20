import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectOidc } from '../../oidc';

@Component({
  selector: 'div[appAuthButtonsLoggedIn]',
  imports: [RouterLink],
  template: `
    <a routerLink="/account" class="avatar" aria-label="Open your account">
      <img
        [src]="oidc.user().avatarImgUrl"
        [alt]="oidc.user().displayName + ' avatar'"
        width="32"
        height="32"
      />
    </a>
    <button type="button" (click)="oidc.logout()">Logout</button>
  `,
})
export class AuthButtonsLoggedIn {
  protected readonly oidc = injectOidc({ assert: 'user logged in' });
}
