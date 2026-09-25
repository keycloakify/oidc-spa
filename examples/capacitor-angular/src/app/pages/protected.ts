import { Component, inject } from '@angular/core';
import { Oidc } from '../services/oidc.service';

@Component({
  selector: 'app-protected',
  template: `
    <div class="container">
      <h1>Protected Page</h1>

      @if (oidc.initializationError) {
      <div class="error">
        <strong>Initialization Error:</strong>
        <p>{{ oidc.initializationError.message }}</p>
      </div>
      } @if (oidc.isUserLoggedIn) {
      <div class="success">
        <h2>Welcome, {{ oidc.$decodedIdToken().name }}!</h2>
        <p>You are logged in.</p>

        <div class="info">
          <strong>User Info:</strong>
          <p>Email: {{ oidc.$decodedIdToken().email || 'N/A' }}</p>
          <p>Subject: {{ oidc.$decodedIdToken().sub }}</p>
        </div>

        <div>
          <strong>Token Info:</strong>
          @if (oidc.$secondsLeftBeforeAutoLogout() !== null) {
          <p>Seconds until auto-logout: {{ oidc.$secondsLeftBeforeAutoLogout() }}</p>
          }
        </div>

        <button (click)="logout()">Logout</button>
        <button (click)="renewTokens()">Renew Tokens</button>
      </div>
      }
    </div>
  `,
  styles: ``,
})
export class ProtectedComponent {
  readonly oidc = inject(Oidc);

  logout() {
    this.oidc.logout({ redirectTo: 'home' });
  }

  async renewTokens() {
    try {
      await this.oidc.renewTokens();
      console.log('Tokens renewed');
    } catch (error) {
      console.error('Token renewal failed', error);
    }
  }
}
