import { Component } from '@angular/core';
import { createKeycloakUtils, isKeycloak } from 'oidc-spa/keycloak-utils';
import { injectOidc } from '../../oidc';

@Component({
  selector: 'div[appAuthButtonsNotLoggedIn]',
  template: `
    <button type="button" class="button-primary" (click)="oidc.login()">Login</button>
    @if (keycloakUtils) {
    <button
      type="button"
      (click)="
          oidc.login({
            transformAuthorizationUrl: this.keycloakUtils.transformAuthorizationUrl_register,
          })
        "
    >
      Register
    </button>
    }
  `,
})
export class AuthButtonsNotLoggedIn {
  protected readonly oidc = injectOidc({ assert: 'user not logged in' });
  protected readonly keycloakUtils = isKeycloak({ issuerUri: this.oidc.issuerUri })
    ? createKeycloakUtils({ issuerUri: this.oidc.issuerUri })
    : undefined;
}
