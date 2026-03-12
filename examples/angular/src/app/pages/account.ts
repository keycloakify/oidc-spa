import { Component, inject } from '@angular/core';
import { createKeycloakUtils, isKeycloak } from 'oidc-spa/keycloak';
import { Oidc } from '../services/oidc.service';

type AccountAction = 'UPDATE_PASSWORD' | 'UPDATE_PROFILE' | 'delete_account';

@Component({
  selector: 'app-account',
  template: `
    <h1>Your account</h1>

    <dl>
      <div>
        <dt>Name</dt>
        <dd>{{ oidc.$decodedIdToken().name }}</dd>
      </div>
      @if (oidc.$decodedIdToken().email) {
      <div>
        <dt>Email</dt>
        <dd>{{ oidc.$decodedIdToken().email }}</dd>
      </div>
      } @if (oidc.$decodedIdToken().preferred_username) {
      <div>
        <dt>Username</dt>
        <dd>{{ oidc.$decodedIdToken().preferred_username }}</dd>
      </div>
      }
    </dl>

    @if (keycloakUtils) {
    <section>
      <p>Account management actions:</p>
      <div>
        <button (click)="triggerAccountAction('UPDATE_PASSWORD')">Change password</button>
        <button (click)="triggerAccountAction('UPDATE_PROFILE')">Update profile</button>
        <button (click)="triggerAccountAction('delete_account')">Delete account</button>
      </div>

      @if (actionResult) {
      <p>
        Result for {{ actionResult.action }}:
        <strong>{{ actionResult.status }}</strong>
      </p>
      } @if (accountUrl) {
      <p>
        <a [href]="accountUrl" rel="noreferrer">Open Keycloak account console</a>
      </p>
      }
    </section>
    }
  `,
})
export class Account {
  oidc = inject(Oidc);

  protected readonly keycloakUtils = isKeycloak({ issuerUri: this.oidc.issuerUri })
    ? createKeycloakUtils({ issuerUri: this.oidc.issuerUri })
    : undefined;

  protected readonly accountUrl = this.keycloakUtils?.getAccountUrl({
    clientId: this.oidc.clientId,
    validRedirectUri: this.oidc.validRedirectUri,
    locale: undefined,
  });

  protected readonly actionResult = this.readAccountActionResult();

  protected triggerAccountAction(action: AccountAction) {
    return this.oidc.goToAuthServer({
      extraQueryParams: { kc_action: action },
    });
  }

  private readAccountActionResult(): { action: string; status: string } | undefined {
    const searchParams = new URLSearchParams(window.location.search);

    const action = searchParams.get('kc_action');
    const status = searchParams.get('kc_action_status');

    if (action === null || status === null) {
      return undefined;
    }

    return { action, status };
  }
}
