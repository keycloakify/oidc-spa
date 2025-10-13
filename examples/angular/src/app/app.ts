import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Oidc } from './services/oidc.service';
import { createKeycloakUtils } from 'oidc-spa/keycloak';
import { inject } from '@angular/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  oidc = inject(Oidc);
  keycloakUtils = createKeycloakUtils({
    issuerUri: this.oidc.issuerUri,
  });
}
