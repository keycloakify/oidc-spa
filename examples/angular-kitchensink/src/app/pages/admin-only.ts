import { Component } from '@angular/core';
import { createKeycloakUtils } from 'oidc-spa/keycloak';
import { injectOidc } from '../services/oidc.service';

@Component({
  selector: 'app-admin-only',
  template: `
    <h2>Admin zone</h2>
    <p>If you can read this, you are admin of the Keycloak realm: "{{ realm }}".</p>
    <a href="{{ adminConsoleLink }}" target="_blank">Keycloak Admin Console Link</a>
  `,
})
export class AdminOnly {
  oidc = injectOidc({ assert: 'user logged in' });

  keycloakUtils = createKeycloakUtils({ issuerUri: this.oidc.issuerUri });

  realm = this.keycloakUtils.issuerUriParsed.realm;

  adminConsoleLink = this.keycloakUtils.adminConsoleUrl;
}
