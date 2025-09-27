import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { createKeycloakUtils } from 'oidc-spa/keycloak';
import { OidcService } from 'oidc-spa/angular';
import { inject } from '@angular/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  oidcService = inject(OidcService);
  sigDecodedIdToken = this.oidcService.sigDecodedIdToken;
  sigSecondsLeftBeforeAutoLogout = this.oidcService.getSigSecondsLeftBeforeAutoLogout({
    warningDurationSeconds: 45,
  });
  keycloakUtils = createKeycloakUtils({
    issuerUri: this.oidcService.issuerUri,
  });
}
