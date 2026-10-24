import { Component } from '@angular/core';
import { injectOidc } from '../oidc';

@Component({
  selector: 'app-auto-logout-warning-overlay',
  template: `
    @if (oidc.autoLogoutState(); as state) { @if (state.shouldDisplayWarning) {
    <div
      class="session-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-heading"
    >
      <div>
        <h2 id="session-heading">Are you still there?</h2>
        <p>You will be logged out in {{ state.secondsLeftBeforeAutoLogout }} seconds.</p>
      </div>
    </div>
    } }
  `,
})
export class AutoLogoutWarningOverlay {
  readonly oidc = injectOidc();
}
