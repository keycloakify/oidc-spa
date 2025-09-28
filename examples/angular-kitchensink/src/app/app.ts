import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Oidc } from './services/oidc.service';
import { createKeycloakUtils } from 'oidc-spa/keycloak';
import { inject } from '@angular/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './app.html',
})
export class App {
  oidc = inject(Oidc);
  get keycloakUtils() {
    return createKeycloakUtils({
      issuerUri: this.oidc.issuerUri,
    });
  }

  get canShowAdminLink(): boolean {
    if (!this.oidc.isUserLoggedIn) {
      return true;
    }

    const roles = this.oidc.$decodedIdToken().realm_access?.roles ?? [];
    return roles.includes('admin');
  }
}
