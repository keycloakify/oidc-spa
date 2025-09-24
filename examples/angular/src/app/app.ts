import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { getOidc, get$decodedIdToken, get$secondsLeftBeforeAutoLogout } from '../oidc';
import { createKeycloakUtils } from 'oidc-spa/keycloak';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  oidc = getOidc();
  $decodedIdToken = get$decodedIdToken();
  $secondsLeftBeforeAutoLogout = get$secondsLeftBeforeAutoLogout({
    warningDurationSeconds: 45,
  });
  keycloakUtils = createKeycloakUtils({
    issuerUri: this.oidc.params.issuerUri,
  });
}
