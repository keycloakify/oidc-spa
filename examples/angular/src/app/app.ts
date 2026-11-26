import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './components/app-header/app-header';
import { AutoLogoutWarningOverlay } from './components/auto-logout-warning-overlay';
import { injectOidc } from './oidc';

@Component({
  imports: [RouterOutlet, AppHeader, AutoLogoutWarningOverlay],
  selector: 'app-root',
  template: `
    <app-header />
    <main><router-outlet /></main>
    @if (oidc.isUserLoggedIn) {
    <app-auto-logout-warning-overlay />
    }
  `,
})
export class App {
  protected readonly oidc = injectOidc();
}
