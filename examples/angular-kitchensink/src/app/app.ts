import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { injectOidc } from './services/oidc.service';
import { createKeycloakUtils } from 'oidc-spa/keycloak';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './app.html',
})
export class App {
  oidc = injectOidc();
  get keycloakUtils() {
    return createKeycloakUtils({
      issuerUri: this.oidc.issuerUri,
    });
  }

  get accountConsoleUrl() {
    return this.keycloakUtils.getAccountUrl({
      clientId: this.oidc.clientId,
      validRedirectUri: this.oidc.validRedirectUri,
    });
  }

  get shouldShowAdminLink(): boolean {
    if (!this.oidc.isUserLoggedIn) {
      return true;
    }

    return this.oidc.user().canSeeAdminNavigation;
  }
}
