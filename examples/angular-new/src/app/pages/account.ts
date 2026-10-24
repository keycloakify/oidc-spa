import { Component } from '@angular/core';
import { createKeycloakUtils, isKeycloak } from 'oidc-spa/keycloak';
import { injectOidc } from '../services/oidc.service';

@Component({
  selector: 'app-account',
  template: `
    <h1>Account</h1>
    <p>Your profile and account settings.</p>
    <dl>
      <dt>Name</dt>
      <dd>{{ oidc.user().displayName }}</dd>
      @if (oidc.user().email) {
      <dt>Email</dt>
      <dd>{{ oidc.user().email }}</dd>
      }
    </dl>
    @if (keycloakUtils) {
    <div class="actions">
      <button type="button" (click)="startAccountAction('UPDATE_PASSWORD')">Change password</button>
      <button type="button" (click)="startAccountAction('UPDATE_PROFILE')">Update profile</button>
      <button type="button" class="button-danger" (click)="startAccountAction('delete_account')">
        Delete account
      </button>
    </div>
    @if (oidc.authorizationResult; as result) { @if (result.authorizationParams['kc_action']) {
    <p role="status">
      Result for {{ result.authorizationParams['kc_action'] }}:
      {{ result.response['kc_action_status'] }}
    </p>
    } }
    <p>
      <a
        [href]="
            keycloakUtils.getAccountUrl({
              clientId: oidc.clientId,
              validRedirectUri: oidc.validRedirectUri,
            })
          "
        target="_blank"
        rel="noreferrer"
        >Open the Keycloak account console</a
      >
    </p>
    }
  `,
})
export class Account {
  readonly oidc = injectOidc({ assert: 'user logged in' });
  readonly keycloakUtils = isKeycloak({ issuerUri: this.oidc.issuerUri })
    ? createKeycloakUtils({ issuerUri: this.oidc.issuerUri })
    : undefined;

  startAccountAction(action: string) {
    return this.oidc.startAuthorization({ authorizationParams: { kc_action: action } });
  }
}
