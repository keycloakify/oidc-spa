import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { injectOidc } from './services/oidc.service';
import { createKeycloakUtils } from 'oidc-spa/keycloak';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  oidc = injectOidc();
  get keycloakUtils() {
    return createKeycloakUtils({ issuerUri: this.oidc.issuerUri });
  }

  get accountUrl() {
    return this.keycloakUtils.getAccountUrl({
      clientId: this.oidc.clientId,
      validRedirectUri: this.oidc.validRedirectUri,
    });
  }
}
